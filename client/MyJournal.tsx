import { useCallback, useEffect, useRef, useState } from 'react';
import type { JournalEntry } from '../shared/types/journal';
import type { UserIngredient } from '../shared/types/types';
import LoadingSpinner from './components/LoadingSpinner';
import CollectionContextMenu from './components/CollectionContextMenu';
import { contextMenuPosition } from './components/contextMenuPosition';
import SwipeableCollectionRow from './components/SwipeableCollectionRow';
import MealMicronutrients from './meal-generator/components/MealMicronutrients';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import NutritionOverview from './meal-generator/components/NutritionOverview';
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
    deleteJournalEntry,
    getJournalEntries,
    reorderJournalEntries,
    saveJournalEntry,
    updateJournalEntryIngredients,
} from './services/journalService';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useUndoableDelete } from './hooks/useUndoableDelete';
import { useLongPressReorder } from './hooks/useLongPressReorder';
import AddRowButton from './components/AddRowButton';
import ActionToast from './components/ActionToast';
import { successToastColors } from './components/actionToastColors';
import AddMealSheet from './journal/AddMealSheet';
import { nextPlanTime } from './journal/planMeal';
import type { Recipe } from '../shared/types/recipe';
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

/** Move Up, Move Down and Delete, with a separator. */
const MEAL_MENU_HEIGHT = 151;

/** "Meal N" over the name, optionally followed by the open chevron. */
function MealLabelText({
    number,
    name,
    chevron,
}: {
    number: number;
    name: string;
    chevron?: 'shown' | 'space';
}) {
    return (
        <>
            <small>Meal {number}</small>
            <strong>
                {name}
                {chevron && (
                    <>
                        {'\u2060'}
                        <span
                            className={`journal-meal-open-chevron ingredient-name-chevron${chevron === 'space' ? ' ingredient-name-chevron-space' : ''}`}
                            aria-hidden="true"
                        />
                    </>
                )}
            </strong>
        </>
    );
}

export default function MyJournal({
    isActive = true,
    savedIngredients = [],
    onEnterMeal,
    onOpenMeal,
}: {
    isActive?: boolean;
    savedIngredients?: UserIngredient[];
    /** Opens Add Meal to enter a meal by hand for `day`, listed last. */
    onEnterMeal?: (target: { day: string; eatenAt: string }) => void;
    /** Opens the meal as a recipe page. */
    onOpenMeal?: (entry: JournalEntry) => void;
}) {
    const [day, setDay] = useState(() => localDateValue());
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [view, setView] = useState<'meals' | 'foods' | 'nutrients'>('meals');
    const [expandedEntryIds, setExpandedEntryIds] = useState<string[]>([]);
    // Meals whose ingredients are being edited show a calmer header.
    const [editingEntryIds, setEditingEntryIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const setEntryEditing = useCallback((id: string, editing: boolean) => {
        setEditingEntryIds((current) => {
            if (current.has(id) === editing) return current;
            const next = new Set(current);
            if (editing) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);
    const [actionSlots, setActionSlots] = useState<
        Record<string, HTMLDivElement | null>
    >({});
    // Stable per-meal ref callbacks; a fresh callback each render would
    // detach and reattach the slot, updating state in a loop.
    const [actionSlotRefs] = useState(
        () => new Map<string, (node: HTMLDivElement | null) => void>(),
    );
    function actionSlotRef(id: string) {
        let ref = actionSlotRefs.get(id);
        if (!ref) {
            ref = (node) =>
                setActionSlots((current) =>
                    current[id] === node ? current : { ...current, [id]: node },
                );
            actionSlotRefs.set(id, ref);
        }
        return ref;
    }
    const [orderError, setOrderError] = useState('');
    const [addingMeal, setAddingMeal] = useState(false);
    const [mealAdded, setMealAdded] = useState(0);
    const journalChangeSource = useRef(Symbol('my-journal'));
    const lastPointerType = useRef('mouse');
    const mealListRef = useRef<HTMLOListElement>(null);
    const [result, setResult] = useState<{
        day: string;
        entries: JournalEntry[];
        error?: string;
    }>();
    // Swipe or right-click to remove. The meal hides at once and is only
    // deleted when the Undo toast expires, so Undo needs no re-insert.
    const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
    const [mealMenu, setMealMenu] = useState<{
        entry: JournalEntry;
        x: number;
        y: number;
        trigger: HTMLElement | null;
    } | null>(null);
    const closeMealMenu = useCallback(() => setMealMenu(null), []);
    const [removeError, setRemoveError] = useState('');
    const {
        rowRef,
        exitClass,
        exitStyle,
        hiddenIds,
        remove,
        finish: finishRemoval,
        undoToast,
    } = useUndoableDelete<HTMLLIElement>({
        isActive,
        onHidden: () => setOpenSwipeId(null),
        commit: async (ids) => {
            const removed = new Set<string>();
            await Promise.all(
                ids.map((id) =>
                    deleteJournalEntry(id, journalChangeSource.current).then(
                        () => removed.add(id),
                        () =>
                            setRemoveError('Could not remove meal. Try again.'),
                    ),
                ),
            );
            setResult((previous) =>
                previous
                    ? {
                          ...previous,
                          entries: previous.entries.filter(
                              (entry) => !removed.has(entry.id),
                          ),
                      }
                    : previous,
            );
        },
    });
    const mealsTabRef = useRef<HTMLButtonElement>(null);
    const foodsTabRef = useRef<HTMLButtonElement>(null);
    const nutrientsTabRef = useRef<HTMLButtonElement>(null);
    const [refreshing, setRefreshing] = useState(false);
    const refreshingRef = useRef(false);
    const requestIdRef = useRef(0);
    const staleWhileHidden = useRef(false);
    const [refreshError, setRefreshError] = useState('');
    useEffect(
        () =>
            subscribeJournalChanges((source) => {
                if (source === journalChangeSource.current) return;
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
            setOpenSwipeId(null);
            setMealMenu(null);
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
    const entries = (current?.entries ?? []).filter(
        (entry) => !hiddenIds.has(entry.id),
    );
    // Long press lifts a meal; dropping it saves the new order straight away.
    const { liftedId, pressProps, projectedIndex } = useLongPressReorder({
        listRef: mealListRef,
        enabled: isActive && view === 'meals' && entries.length > 1,
        onLift: () => {
            // The saved order must list every meal, so settle any removal.
            finishRemoval();
            setOpenSwipeId(null);
            setMealMenu(null);
        },
        onReorder: (id, to) => {
            const ids = entries.map((entry) => entry.id);
            ids.splice(ids.indexOf(id), 1);
            ids.splice(to, 0, id);
            saveMealOrder(ids);
        },
    });
    const refresh = () => {
        if (!current || current.error || refreshingRef.current || liftedId)
            return;
        refreshingRef.current = true;
        requestIdRef.current++;
        setRefreshing(true);
        setRefreshError('');
        setAttempt((value) => value + 1);
    };
    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive,
        disabled: !current || Boolean(current.error) || Boolean(liftedId),
        refreshing,
        onRefresh: refresh,
    });
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
        if (!nextDay || liftedId) return;
        refreshingRef.current = false;
        requestIdRef.current++;
        setRefreshing(false);
        setRefreshError('');
        setExpandedEntryIds([]);
        setOrderError('');
        setOpenSwipeId(null);
        setDay(nextDay);
    }

    function toggleEntry(id: string) {
        setExpandedEntryIds((current) =>
            current.includes(id)
                ? current.filter((entryId) => entryId !== id)
                : [...current, id],
        );
    }

    function removeMeal(entry: JournalEntry) {
        setMealMenu(null);
        setRemoveError('');
        remove([entry.id], 'Meal removed.');
    }

    /** Shows the new order at once and saves it in the background. */
    function saveMealOrder(orderedIds: string[]) {
        const previous = current?.entries;
        if (!previous) return;
        const byId = new Map(previous.map((entry) => [entry.id, entry]));
        const reordered = [
            ...orderedIds.flatMap((id) => byId.get(id) ?? []),
            ...previous.filter((entry) => !orderedIds.includes(entry.id)),
        ].map((entry, index) => ({ ...entry, planPosition: index + 1 }));
        const showOrder = (next: JournalEntry[]) =>
            setResult((value) =>
                value?.day === day ? { ...value, entries: next } : value,
            );
        showOrder(reordered);
        setOrderError('');
        reorderJournalEntries(day, orderedIds).catch(() => {
            showOrder(previous);
            setOrderError('Could not save meal order. Try again.');
        });
    }

    /** Copies a saved recipe into this day's plan as its last meal. */
    async function addRecipeToPlan(recipe: Recipe) {
        const saved = await saveJournalEntry(
            {
                eatenAt: nextPlanTime(day, current?.entries ?? []),
                mealName: recipe.recipeName,
                ingredients: recipe.ingredients,
            },
            journalChangeSource.current,
        );
        setResult((value) =>
            value?.day === day
                ? { ...value, entries: [...value.entries, saved] }
                : value,
        );
        setAddingMeal(false);
        setMealAdded((count) => count + 1);
    }

    function mealMoveActions(id: string) {
        const index = entries.findIndex((entry) => entry.id === id);
        return [
            index > 0 && {
                label: 'Move Up',
                icon: <path d="M12 19V5m-6 6 6-6 6 6" />,
                onSelect: () => moveMeal(id, -1),
            },
            index >= 0 &&
                index < entries.length - 1 && {
                    label: 'Move Down',
                    icon: <path d="M12 5v14m-6-6 6 6 6-6" />,
                    onSelect: () => moveMeal(id, 1),
                },
        ].filter((action) => action !== false);
    }

    function moveMeal(id: string, offset: number) {
        const ids = entries.map((entry) => entry.id);
        const index = ids.indexOf(id);
        const destination = index + offset;
        if (index < 0 || destination < 0 || destination >= ids.length) return;
        finishRemoval();
        [ids[index], ids[destination]] = [ids[destination], ids[index]];
        saveMealOrder(ids);
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
                        disabled={Boolean(liftedId)}
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
                        disabled={Boolean(liftedId)}
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
                        disabled={Boolean(liftedId)}
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
                            const views = [
                                'meals',
                                'foods',
                                'nutrients',
                            ] as const;
                            const currentIndex = views.indexOf(view);
                            const next =
                                event.key === 'ArrowRight'
                                    ? views[(currentIndex + 1) % views.length]
                                    : event.key === 'ArrowLeft'
                                      ? views[
                                            (currentIndex + views.length - 1) %
                                                views.length
                                        ]
                                      : event.key === 'End'
                                        ? 'nutrients'
                                        : event.key === 'Home'
                                          ? 'meals'
                                          : null;
                            if (!next) return;
                            event.preventDefault();
                            setView(next);
                            ({
                                meals: mealsTabRef,
                                foods: foodsTabRef,
                                nutrients: nutrientsTabRef,
                            })[next].current?.focus();
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
                            onClick={() => setView('foods')}
                        >
                            Food List
                        </button>
                        <button
                            ref={nutrientsTabRef}
                            type="button"
                            role="tab"
                            id="journal-nutrients-tab"
                            aria-controls="journal-nutrients-panel"
                            aria-selected={view === 'nutrients'}
                            tabIndex={view === 'nutrients' ? 0 : -1}
                            onClick={() => setView('nutrients')}
                        >
                            Key nutrients
                        </button>
                    </div>
                    <div
                        id="journal-meals-panel"
                        role="tabpanel"
                        aria-labelledby="journal-meals-tab"
                        hidden={view !== 'meals'}
                    >
                        {(orderError || removeError) && (
                            <p className="journal-order-error" role="alert">
                                {orderError || removeError}
                            </p>
                        )}
                        {entries.length ? (
                            <ol
                                ref={mealListRef}
                                className={`journal-meals${liftedId ? ' journal-meals-dragging' : ''}`}
                            >
                                {entries.map((entry, index) => {
                                    const expanded = expandedEntryIds.includes(
                                        entry.id,
                                    );
                                    const editingMeal = editingEntryIds.has(
                                        entry.id,
                                    );
                                    const canOpen = Boolean(
                                        onOpenMeal && expanded && !editingMeal,
                                    );
                                    const mealNumber =
                                        projectedIndex(index) + 1;
                                    const press = pressProps(entry.id);
                                    return (
                                        <li
                                            className={`journal-meal-card${liftedId === entry.id ? ' journal-meal-dragging' : ''}${exitClass(entry.id)}`}
                                            ref={rowRef(entry.id)}
                                            data-expanded={expanded}
                                            data-reorder-id={entry.id}
                                            style={exitStyle(entry.id)}
                                            key={entry.id}
                                        >
                                            <SwipeableCollectionRow
                                                name={entry.mealName}
                                                enabled={!liftedId}
                                                open={openSwipeId === entry.id}
                                                onOpen={() =>
                                                    setOpenSwipeId(entry.id)
                                                }
                                                onClose={() =>
                                                    setOpenSwipeId((id) =>
                                                        id === entry.id
                                                            ? null
                                                            : id,
                                                    )
                                                }
                                                onDelete={() =>
                                                    removeMeal(entry)
                                                }
                                            >
                                                {/* Long press, right-click and Alt+Arrow work anywhere on
                                                    the row. A collapsed meal expands from anywhere; once
                                                    expanded, the name (with its chevron) opens the meal
                                                    page and the trailing chevron collapses it. */}
                                                <div
                                                    className={`journal-meal-row${canOpen ? ' journal-meal-row-split' : ''}${editingMeal ? ' journal-meal-row-editing' : ''}`}
                                                    // Editing pauses reordering, so a long press
                                                    // near ✕ / ✓ never lifts the meal.
                                                    {...(editingMeal
                                                        ? {}
                                                        : press)}
                                                    onPointerDown={(event) => {
                                                        lastPointerType.current =
                                                            event.pointerType;
                                                        if (!editingMeal)
                                                            press.onPointerDown(
                                                                event,
                                                            );
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (!event.altKey)
                                                            return;
                                                        const offset =
                                                            event.key ===
                                                            'ArrowUp'
                                                                ? -1
                                                                : event.key ===
                                                                    'ArrowDown'
                                                                  ? 1
                                                                  : 0;
                                                        if (!offset) return;
                                                        event.preventDefault();
                                                        moveMeal(
                                                            entry.id,
                                                            offset,
                                                        );
                                                    }}
                                                    onContextMenu={(event) => {
                                                        // Leave the open edit actions their own menu.
                                                        if (
                                                            (
                                                                event.target as HTMLElement
                                                            ).closest(
                                                                '.journal-meal-ingredient-actions',
                                                            )
                                                        )
                                                            return;
                                                        event.preventDefault();
                                                        press.onPointerUp();
                                                        // Touch long press lifts the meal; the menu is
                                                        // for right-click and the keyboard menu key.
                                                        if (
                                                            liftedId ||
                                                            lastPointerType.current ===
                                                                'touch'
                                                        )
                                                            return;
                                                        const toggle =
                                                            event.currentTarget.querySelector<HTMLElement>(
                                                                '.journal-meal-toggle',
                                                            ) ??
                                                            event.currentTarget;
                                                        const bounds =
                                                            event.currentTarget.getBoundingClientRect();
                                                        setOpenSwipeId(null);
                                                        setMealMenu({
                                                            entry,
                                                            trigger: toggle,
                                                            ...contextMenuPosition(
                                                                event.clientX ||
                                                                    bounds.left +
                                                                        16,
                                                                event.clientY ||
                                                                    bounds.bottom,
                                                                MEAL_MENU_HEIGHT,
                                                            ),
                                                        });
                                                    }}
                                                >
                                                    {/* No collapse while editing: leaving saves,
                                                        and ✓ takes this column. */}
                                                    {!editingMeal && (
                                                        <button
                                                            type="button"
                                                            className="journal-meal-toggle"
                                                            aria-label={`Meal ${mealNumber}, ${entry.mealName}`}
                                                            aria-expanded={
                                                                expanded
                                                            }
                                                            aria-controls={`journal-meal-${entry.id}`}
                                                            aria-keyshortcuts={
                                                                entries.length >
                                                                1
                                                                    ? 'Alt+ArrowUp Alt+ArrowDown'
                                                                    : undefined
                                                            }
                                                            title={
                                                                entries.length >
                                                                1
                                                                    ? 'Hold and drag to reorder'
                                                                    : undefined
                                                            }
                                                            onClick={() =>
                                                                toggleEntry(
                                                                    entry.id,
                                                                )
                                                            }
                                                        >
                                                            <svg
                                                                className="journal-meal-chevron"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                aria-hidden="true"
                                                            >
                                                                <path d="m6 9 6 6 6-6" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {canOpen ? (
                                                        <button
                                                            type="button"
                                                            className="journal-meal-label journal-meal-open"
                                                            aria-label={`Open ${entry.mealName} recipe`}
                                                            disabled={Boolean(
                                                                liftedId,
                                                            )}
                                                            onClick={() =>
                                                                onOpenMeal?.(
                                                                    entry,
                                                                )
                                                            }
                                                        >
                                                            <MealLabelText
                                                                number={
                                                                    mealNumber
                                                                }
                                                                name={
                                                                    entry.mealName
                                                                }
                                                                chevron="shown"
                                                            />
                                                        </button>
                                                    ) : (
                                                        <span
                                                            className="journal-meal-label"
                                                            aria-hidden="true"
                                                        >
                                                            <MealLabelText
                                                                number={
                                                                    mealNumber
                                                                }
                                                                name={
                                                                    entry.mealName
                                                                }
                                                                // Hidden, but keeps the name wrapping
                                                                // the same as when it opens the meal.
                                                                chevron={
                                                                    onOpenMeal
                                                                        ? 'space'
                                                                        : undefined
                                                                }
                                                            />
                                                        </span>
                                                    )}
                                                    <div
                                                        className="journal-meal-ingredient-actions"
                                                        ref={actionSlotRef(
                                                            entry.id,
                                                        )}
                                                    />
                                                </div>
                                            </SwipeableCollectionRow>
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
                                                        expanded={expanded}
                                                        actionsContainer={
                                                            actionSlots[
                                                                entry.id
                                                            ]
                                                        }
                                                        disabled={Boolean(
                                                            liftedId,
                                                        )}
                                                        savedIngredients={
                                                            savedIngredients
                                                        }
                                                        onEditingChange={(
                                                            editing,
                                                        ) =>
                                                            setEntryEditing(
                                                                entry.id,
                                                                editing,
                                                            )
                                                        }
                                                        onSave={async (
                                                            next,
                                                        ) => {
                                                            const saved =
                                                                await updateJournalEntryIngredients(
                                                                    entry.id,
                                                                    next,
                                                                    journalChangeSource.current,
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
                                                            return saved;
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
                                    Add a meal from My Recipes or enter one
                                    yourself.
                                </p>
                            </div>
                        )}
                        {current && !current.error && (
                            <AddRowButton
                                label="Add meal"
                                className="journal-add-meal"
                                disabled={Boolean(liftedId)}
                                onClick={() => {
                                    setOpenSwipeId(null);
                                    setAddingMeal(true);
                                }}
                            />
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
                    <div
                        id="journal-nutrients-panel"
                        role="tabpanel"
                        aria-labelledby="journal-nutrients-tab"
                        hidden={view !== 'nutrients'}
                    >
                        {view === 'nutrients' && (
                            <div className="journal-nutrients-card">
                                <MealMicronutrients
                                    ingredients={ingredients}
                                    scope="day"
                                />
                            </div>
                        )}
                    </div>
                </>
            )}
            {mealMenu && (
                <CollectionContextMenu
                    name={mealMenu.entry.mealName}
                    x={mealMenu.x}
                    y={mealMenu.y}
                    trigger={mealMenu.trigger}
                    actions={mealMoveActions(mealMenu.entry.id)}
                    onDelete={() => removeMeal(mealMenu.entry)}
                    onClose={closeMealMenu}
                />
            )}
            {isActive && addingMeal && (
                <AddMealSheet
                    onClose={() => setAddingMeal(false)}
                    onAddRecipe={addRecipeToPlan}
                    onManual={() => {
                        setAddingMeal(false);
                        onEnterMeal?.({
                            day,
                            eatenAt: nextPlanTime(day, current?.entries ?? []),
                        });
                    }}
                />
            )}
            {mealAdded > 0 && (
                <ActionToast
                    key={mealAdded}
                    message="Meal added."
                    placement="floating"
                    colors={successToastColors}
                    onClose={() => setMealAdded(0)}
                />
            )}
            {undoToast}
        </section>
    );
}
