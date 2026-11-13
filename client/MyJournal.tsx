import { useEffect, useRef, useState } from 'react';
import type { JournalEntry } from '../shared/types/journal';
import type { UserIngredient } from '../shared/types/types';
import LoadingSpinner from './components/LoadingSpinner';
import MealMicronutrients from './meal-generator/components/MealMicronutrients';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import NutritionOverview from './meal-generator/components/NutritionOverview';
import defaultMealPhoto from './assets/default-meal-photo.jpg';
import { localDateValue } from './journal/nutrition';
import { subscribeJournalChanges } from './journal/changes';
import PlanCalendar from './journal/PlanCalendar';
import JournalMealIngredients from './journal/JournalMealIngredients';
import {
    hasUnavailableNutrition,
    knownNutritionIngredients,
    totalFiber,
    totalNutrition,
} from './utils/nutrition';
import {
    getJournalEntries,
    reorderJournalEntries,
    updateJournalEntryIngredients,
} from './services/journalService';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import './components/SavedCollection.css';
import './MyJournal.css';

function displayDay(day: string) {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function shiftDay(day: string, offset: number) {
    const [year, month, date] = day.split('-').map(Number);
    return localDateValue(new Date(year, month - 1, date + offset));
}

function macroPercentages(ingredients: JournalEntry['ingredients']) {
    const totals = totalNutrition(ingredients);
    const carbohydrate = totals.carbohydrate * 4;
    const protein = totals.protein * 4;
    const fat = totals.fat * 9;
    const total = carbohydrate + protein + fat;
    return {
        carbohydrate: total > 0 ? (carbohydrate / total) * 100 : 0,
        protein: total > 0 ? (protein / total) * 100 : 0,
        fat: total > 0 ? (fat / total) * 100 : 0,
    };
}

function displayWeight(weight: number) {
    return `${Number(weight.toFixed(1))} g`;
}

export default function MyJournal({
    isActive = true,
    savedIngredients = [],
}: {
    isActive?: boolean;
    savedIngredients?: UserIngredient[];
}) {
    const [day, setDay] = useState(() => localDateValue());
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [view, setView] = useState<'meals' | 'foods'>('meals');
    const [expandedEntryIds, setExpandedEntryIds] = useState<string[]>([]);
    const [reordering, setReordering] = useState(false);
    const [draftOrder, setDraftOrder] = useState<string[]>([]);
    const [savingOrder, setSavingOrder] = useState(false);
    const [orderError, setOrderError] = useState('');
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const longPressTimer = useRef<number | null>(null);
    const pressStart = useRef<{ x: number; y: number } | null>(null);
    useEffect(
        () => () => {
            if (longPressTimer.current !== null)
                window.clearTimeout(longPressTimer.current);
        },
        [],
    );
    const mealsTabRef = useRef<HTMLButtonElement>(null);
    const foodsTabRef = useRef<HTMLButtonElement>(null);
    const [refreshing, setRefreshing] = useState(false);
    const refreshingRef = useRef(false);
    const requestIdRef = useRef(0);
    const staleWhileHidden = useRef(false);
    const [refreshError, setRefreshError] = useState('');
    const [result, setResult] = useState<{
        day: string;
        entries: JournalEntry[];
        error?: string;
    }>();
    useEffect(
        () =>
            subscribeJournalChanges(() => {
                if (isActive) setAttempt((value) => value + 1);
                else staleWhileHidden.current = true;
            }),
        [isActive],
    );
    useEffect(() => {
        if (isActive && staleWhileHidden.current) {
            staleWhileHidden.current = false;
            setAttempt((value) => value + 1);
        }
    }, [isActive]);
    useEffect(() => {
        if (!isActive) return;
        return () => {
            setCalendarOpen(false);
            setDraggingId(null);
        };
    }, [isActive]);
    useEffect(() => {
        let active = true;
        const requestId = ++requestIdRef.current;
        getJournalEntries(day)
            .then((entries) => {
                if (active && requestId === requestIdRef.current) {
                    setResult({ day, entries });
                    setRefreshError('');
                }
            })
            .catch(() => {
                if (!active || requestId !== requestIdRef.current) return;
                if (refreshingRef.current)
                    setRefreshError('Could not refresh your plan.');
                else
                    setResult({
                        day,
                        entries: [],
                        error: 'Could not load your plan. Please try again.',
                    });
            })
            .finally(() => {
                if (active && requestId === requestIdRef.current) {
                    refreshingRef.current = false;
                    setRefreshing(false);
                }
            });
        return () => {
            active = false;
        };
    }, [day, attempt]);
    const current = result?.day === day ? result : undefined;
    const refresh = () => {
        if (
            !current ||
            current.error ||
            refreshingRef.current ||
            reordering ||
            savingOrder
        )
            return;
        refreshingRef.current = true;
        requestIdRef.current++;
        setRefreshing(true);
        setRefreshError('');
        setAttempt((value) => value + 1);
    };
    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive,
        disabled:
            !current || Boolean(current.error) || reordering || savingOrder,
        refreshing,
        onRefresh: refresh,
    });
    const entries = current?.entries ?? [];
    const displayedEntries = reordering
        ? [...entries].sort((a, b) => {
              const first = draftOrder.indexOf(a.id);
              const second = draftOrder.indexOf(b.id);
              return (
                  (first < 0 ? Infinity : first) -
                  (second < 0 ? Infinity : second)
              );
          })
        : entries;
    useEffect(() => {
        if (!draggingId) return;
        const moveTo = (clientY: number) => {
            const cards = [
                ...(containerRef.current?.querySelectorAll<HTMLElement>(
                    '.journal-meal-card',
                ) ?? []),
            ];
            let destination = cards.findIndex((card) => {
                const bounds = card.getBoundingClientRect();
                return clientY < bounds.top + bounds.height / 2;
            });
            if (destination < 0) destination = cards.length - 1;
            setDraftOrder((order) => {
                const source = order.indexOf(draggingId);
                if (source < 0 || source === destination || destination < 0)
                    return order;
                const next = [...order];
                next.splice(source, 1);
                next.splice(destination, 0, draggingId);
                return next;
            });
        };
        const onTouchMove = (event: TouchEvent) => {
            if (event.touches.length !== 1) return;
            if (event.cancelable) event.preventDefault();
            moveTo(event.touches[0].clientY);
        };
        const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType === 'mouse') moveTo(event.clientY);
        };
        const stop = () => setDraggingId(null);
        document.addEventListener('touchmove', onTouchMove, {
            passive: false,
            capture: true,
        });
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('touchend', stop, true);
        document.addEventListener('pointerup', stop);
        document.addEventListener('pointercancel', stop);
        return () => {
            document.removeEventListener('touchmove', onTouchMove, true);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('touchend', stop, true);
            document.removeEventListener('pointerup', stop);
            document.removeEventListener('pointercancel', stop);
        };
    }, [containerRef, draggingId]);
    const ingredients = entries.flatMap((entry) => entry.ingredients);
    const dailyKnownIngredients = knownNutritionIngredients(ingredients);
    const dailyTotals = totalNutrition(dailyKnownIngredients);
    const dailyNutritionIncomplete = hasUnavailableNutrition(ingredients);
    const dailyNutritionPartial =
        dailyNutritionIncomplete && dailyKnownIngredients.length > 0;
    const dailyFiber = totalFiber(ingredients);
    const dailyFiberForSummary =
        ingredients.length === 0
            ? { ...dailyFiber, available: true, hasKnown: true }
            : dailyFiber;

    function selectDay(nextDay: string) {
        if (!nextDay || savingOrder || reordering) return;
        refreshingRef.current = false;
        requestIdRef.current++;
        setRefreshing(false);
        setRefreshError('');
        setExpandedEntryIds([]);
        setReordering(false);
        setDraggingId(null);
        setDraftOrder([]);
        setOrderError('');
        setDay(nextDay);
    }

    function toggleEntry(id: string) {
        setExpandedEntryIds((current) =>
            current.includes(id)
                ? current.filter((entryId) => entryId !== id)
                : [...current, id],
        );
    }

    function clearLongPress() {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        pressStart.current = null;
    }

    function startReordering(dragId?: string) {
        if (reordering || entries.length < 2) return;
        setDraftOrder(entries.map((entry) => entry.id));
        setExpandedEntryIds([]);
        setOrderError('');
        setReordering(true);
        if (dragId) setDraggingId(dragId);
    }

    function moveMeal(id: string, offset: number) {
        setDraftOrder((order) => {
            const index = order.indexOf(id);
            const destination = index + offset;
            if (index < 0 || destination < 0 || destination >= order.length)
                return order;
            const next = [...order];
            [next[index], next[destination]] = [next[destination], next[index]];
            return next;
        });
        setOrderError('');
    }

    async function saveOrder() {
        const orderedIds = displayedEntries.map((entry) => entry.id);
        if (orderedIds.every((id, index) => id === entries[index]?.id)) {
            setReordering(false);
            setDraftOrder([]);
            setDraggingId(null);
            return;
        }
        setSavingOrder(true);
        setOrderError('');
        try {
            await reorderJournalEntries(day, orderedIds);
            setResult((previous) =>
                previous?.day === day
                    ? {
                          ...previous,
                          entries: displayedEntries.map((entry, index) => ({
                              ...entry,
                              planPosition: index + 1,
                          })),
                      }
                    : previous,
            );
            setReordering(false);
            setDraggingId(null);
            setDraftOrder([]);
        } catch {
            setOrderError('Could not save meal order. Try again.');
        } finally {
            setSavingOrder(false);
        }
    }
    return (
        <section
            ref={containerRef}
            className={`my-journal saved-collection${isActive ? ' pull-refresh-active' : ''}`}
            aria-labelledby="my-journal-heading"
            hidden={!isActive}
            inert={!isActive}
        >
            <PullRefreshIndicator
                distance={pullDistance}
                refreshing={refreshing}
                label="Refreshing My Plan"
            />
            <header className="saved-collection-intro">
                <div className="saved-collection-title journal-title-row">
                    <h1 id="my-journal-heading">My Plan</h1>
                </div>
                <div className="journal-date-row">
                    <button
                        type="button"
                        aria-label="Previous day"
                        disabled={savingOrder || reordering}
                        onClick={() => selectDay(shiftDay(day, -1))}
                    >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m14 6-6 6 6 6" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="journal-date"
                        aria-label="Choose plan date"
                        aria-haspopup="dialog"
                        aria-expanded={calendarOpen}
                        disabled={savingOrder || reordering}
                        onClick={() => setCalendarOpen(true)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="16" rx="2" />
                            <path d="M7 3v4m10-4v4M3 10h18" />
                        </svg>
                        <span>
                            {day === localDateValue()
                                ? `Today, ${displayDay(day).replace(/ \d{4}$/, '')}`
                                : displayDay(day)}
                        </span>
                    </button>
                    <button
                        type="button"
                        aria-label="Next day"
                        disabled={savingOrder || reordering}
                        onClick={() => selectDay(shiftDay(day, 1))}
                    >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m10 6 6 6-6 6" />
                        </svg>
                    </button>
                </div>
            </header>
            {isActive && calendarOpen && (
                <PlanCalendar
                    selectedDay={day}
                    onClose={() => setCalendarOpen(false)}
                    onSelect={(selectedDay) => {
                        selectDay(selectedDay);
                        setCalendarOpen(false);
                    }}
                />
            )}
            {refreshError && (
                <div className="saved-collection-refresh-error" role="alert">
                    <span>{refreshError}</span>
                    <button type="button" onClick={refresh}>
                        Try again
                    </button>
                </div>
            )}
            {!current ? (
                <div className="journal-loading" role="status">
                    <LoadingSpinner />
                    Loading your plan…
                </div>
            ) : current.error ? (
                <div className="journal-error" role="alert">
                    <p>{current.error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setResult(undefined);
                            setAttempt((value) => value + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <NutritionOverview
                        ariaLabel="Daily nutrition summary"
                        className="journal-day-summary-overview"
                        nutrition={dailyTotals}
                        fiber={dailyFiberForSummary}
                        percentages={macroPercentages(dailyKnownIngredients)}
                        incomplete={dailyNutritionIncomplete}
                        partial={dailyNutritionPartial}
                    />
                    <div
                        className="journal-view-tabs"
                        role="tablist"
                        aria-label="Plan views"
                        onKeyDown={(event) => {
                            const next =
                                event.key === 'ArrowRight' ||
                                event.key === 'End'
                                    ? 'foods'
                                    : event.key === 'ArrowLeft' ||
                                        event.key === 'Home'
                                      ? 'meals'
                                      : null;
                            if (!next) return;
                            if (reordering && next === 'foods') return;
                            event.preventDefault();
                            setView(next);
                            (next === 'meals'
                                ? mealsTabRef
                                : foodsTabRef
                            ).current?.focus();
                        }}
                    >
                        <button
                            ref={mealsTabRef}
                            type="button"
                            role="tab"
                            id="journal-meals-tab"
                            aria-controls="journal-meals-panel"
                            aria-selected={view === 'meals'}
                            tabIndex={view === 'meals' ? 0 : -1}
                            onClick={() => setView('meals')}
                        >
                            Meals
                        </button>
                        <button
                            ref={foodsTabRef}
                            type="button"
                            role="tab"
                            id="journal-foods-tab"
                            aria-controls="journal-foods-panel"
                            aria-selected={view === 'foods'}
                            tabIndex={view === 'foods' ? 0 : -1}
                            disabled={reordering}
                            onClick={() => setView('foods')}
                        >
                            Food List
                        </button>
                    </div>
                    <div
                        id="journal-meals-panel"
                        role="tabpanel"
                        aria-labelledby="journal-meals-tab"
                        hidden={view !== 'meals'}
                    >
                        {reordering && (
                            <div
                                className="journal-reorder-toolbar"
                                role="group"
                                aria-label="Arrange meals"
                            >
                                <span>Arrange meals</span>
                                <button
                                    type="button"
                                    disabled={savingOrder}
                                    onClick={() => {
                                        setReordering(false);
                                        setDraggingId(null);
                                        setDraftOrder([]);
                                        setOrderError('');
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={savingOrder}
                                    onClick={() => void saveOrder()}
                                >
                                    {savingOrder ? (
                                        <LoadingSpinner size="small" />
                                    ) : (
                                        'Done'
                                    )}
                                </button>
                            </div>
                        )}
                        {orderError && (
                            <p className="journal-order-error" role="alert">
                                {orderError}
                            </p>
                        )}
                        {entries.length ? (
                            <ol className="journal-meals">
                                {displayedEntries.map((entry, index) => {
                                    const expanded = expandedEntryIds.includes(
                                        entry.id,
                                    );
                                    return (
                                        <li
                                            className={`journal-meal-card${reordering ? ' journal-meal-arranging' : ''}${draggingId === entry.id ? ' journal-meal-dragging' : ''}`}
                                            key={entry.id}
                                        >
                                            <div className="journal-meal-row">
                                                <button
                                                    type="button"
                                                    className="journal-meal-toggle"
                                                    aria-label={`Meal ${index + 1}, ${entry.mealName}`}
                                                    aria-expanded={
                                                        reordering
                                                            ? undefined
                                                            : expanded
                                                    }
                                                    aria-controls={`journal-meal-${entry.id}`}
                                                    title={
                                                        entries.length > 1 &&
                                                        !reordering
                                                            ? 'Long press to arrange meals'
                                                            : undefined
                                                    }
                                                    onPointerDown={(event) => {
                                                        if (
                                                            reordering ||
                                                            event.button !== 0
                                                        )
                                                            return;
                                                        clearLongPress();
                                                        pressStart.current = {
                                                            x: event.clientX,
                                                            y: event.clientY,
                                                        };
                                                        longPressTimer.current =
                                                            window.setTimeout(
                                                                () => {
                                                                    longPressTimer.current =
                                                                        null;
                                                                    startReordering(
                                                                        entry.id,
                                                                    );
                                                                },
                                                                450,
                                                            );
                                                    }}
                                                    onPointerMove={(event) => {
                                                        if (
                                                            pressStart.current &&
                                                            (Math.abs(
                                                                event.clientX -
                                                                    pressStart
                                                                        .current
                                                                        .x,
                                                            ) > 10 ||
                                                                Math.abs(
                                                                    event.clientY -
                                                                        pressStart
                                                                            .current
                                                                            .y,
                                                                ) > 10)
                                                        )
                                                            clearLongPress();
                                                    }}
                                                    onPointerUp={() => {
                                                        clearLongPress();
                                                        setDraggingId(null);
                                                    }}
                                                    onPointerCancel={() => {
                                                        clearLongPress();
                                                        setDraggingId(null);
                                                    }}
                                                    onPointerLeave={
                                                        clearLongPress
                                                    }
                                                    onContextMenu={(event) => {
                                                        if (entries.length < 2)
                                                            return;
                                                        event.preventDefault();
                                                        clearLongPress();
                                                        startReordering();
                                                    }}
                                                    onClick={() => {
                                                        if (!reordering)
                                                            toggleEntry(
                                                                entry.id,
                                                            );
                                                    }}
                                                >
                                                    <img
                                                        src={defaultMealPhoto}
                                                        alt=""
                                                        width="56"
                                                        height="56"
                                                    />
                                                    <span className="journal-meal-label">
                                                        <small>
                                                            Meal {index + 1}
                                                        </small>
                                                        <strong>
                                                            {entry.mealName}
                                                        </strong>
                                                    </span>
                                                    {!reordering && (
                                                        <svg
                                                            className="journal-meal-chevron"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            aria-hidden="true"
                                                        >
                                                            <path d="m6 9 6 6 6-6" />
                                                        </svg>
                                                    )}
                                                </button>
                                                {reordering && (
                                                    <div className="journal-meal-move-actions">
                                                        <button
                                                            type="button"
                                                            aria-label={`Move ${entry.mealName} up`}
                                                            disabled={
                                                                savingOrder ||
                                                                index === 0
                                                            }
                                                            onClick={() =>
                                                                moveMeal(
                                                                    entry.id,
                                                                    -1,
                                                                )
                                                            }
                                                        >
                                                            <svg
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                aria-hidden="true"
                                                            >
                                                                <path d="m6 14 6-6 6 6" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            aria-label={`Move ${entry.mealName} down`}
                                                            disabled={
                                                                savingOrder ||
                                                                index ===
                                                                    displayedEntries.length -
                                                                        1
                                                            }
                                                            onClick={() =>
                                                                moveMeal(
                                                                    entry.id,
                                                                    1,
                                                                )
                                                            }
                                                        >
                                                            <svg
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                aria-hidden="true"
                                                            >
                                                                <path d="m6 10 6 6 6-6" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div
                                                className="journal-meal-expand"
                                                id={`journal-meal-${entry.id}`}
                                                data-open={expanded}
                                                aria-hidden={!expanded}
                                                inert={!expanded}
                                            >
                                                <div className="journal-meal-expand-inner">
                                                    <JournalMealIngredients
                                                        entry={entry}
                                                        disabled={reordering}
                                                        savedIngredients={
                                                            savedIngredients
                                                        }
                                                        onSave={async (
                                                            next,
                                                        ) => {
                                                            const saved =
                                                                await updateJournalEntryIngredients(
                                                                    entry.id,
                                                                    next,
                                                                );
                                                            setResult(
                                                                (current) =>
                                                                    current?.day ===
                                                                    day
                                                                        ? {
                                                                              ...current,
                                                                              entries:
                                                                                  current.entries.map(
                                                                                      (
                                                                                          item,
                                                                                      ) =>
                                                                                          item.id ===
                                                                                          entry.id
                                                                                              ? saved
                                                                                              : item,
                                                                                  ),
                                                                          }
                                                                        : current,
                                                            );
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <div className="saved-collection-empty journal-empty">
                                <p className="saved-collection-empty-title">
                                    No meals in your plan for this day
                                </p>
                                <p className="saved-collection-empty-hint">
                                    Add a meal from Discover or Recipes to see
                                    it here.
                                </p>
                            </div>
                        )}
                    </div>
                    <div
                        id="journal-foods-panel"
                        role="tabpanel"
                        aria-labelledby="journal-foods-tab"
                        hidden={view !== 'foods'}
                    >
                        {ingredients.length ? (
                            <ul className="journal-food-list">
                                {entries.flatMap((entry) =>
                                    entry.ingredients.map(
                                        (ingredient, index) => (
                                            <li key={`${entry.id}-${index}`}>
                                                <IngredientThumbnail
                                                    name={ingredient.name}
                                                    fdcId={
                                                        ingredient
                                                            .nutritionSource
                                                            ?.fdcId
                                                    }
                                                    source={
                                                        ingredient.thumbnailSource
                                                    }
                                                />
                                                <span>
                                                    <strong>
                                                        {ingredient.resolvedName ??
                                                            ingredient.name}
                                                    </strong>
                                                    <small>
                                                        {entry.mealName}
                                                    </small>
                                                </span>
                                                <b>
                                                    {displayWeight(
                                                        ingredient.weight,
                                                    )}
                                                </b>
                                            </li>
                                        ),
                                    ),
                                )}
                            </ul>
                        ) : (
                            <div className="saved-collection-empty journal-empty">
                                <p className="saved-collection-empty-title">
                                    No foods in your plan for this day
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="journal-nutrients-card">
                        <MealMicronutrients
                            ingredients={ingredients}
                            scope="day"
                        />
                    </div>
                </>
            )}
        </section>
    );
}
