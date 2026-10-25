import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_TARGETS } from '../../shared/types/profile';
import { PLAN_LIMITS } from '../../shared/plans';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import type { UserIngredient } from '../../shared/types/types';
import { usePlan } from '../plan/PlanContext';
import UpgradeNotice from '../plan/UpgradeNotice';
import {
    addDays,
    addEntry,
    fromDateKey,
    getEntriesForRange,
    removeEntry,
    startOfWeek,
    toDateKey,
    updateEntryServings,
} from '../services/mealPlanService';
import { getRecipes } from '../services/recipeService';
import {
    addItems,
    aggregateIngredients,
} from '../services/shoppingListService';
import AddMealSheet from './AddMealSheet';
import {
    getFocusNutrients,
    getSlotBudget,
    getSlotShareCalories,
    sortSlots,
    sumDayMicronutrients,
    sumNutrition,
    type PlannedMeal,
} from './budget';
import CopyMealDialog from './CopyMealDialog';
import DaySummary from './DaySummary';
import MealPeriodCard from './MealPeriodCard';
import {
    formatDayTitle,
    formatLongDate,
    formatShortDate,
    formatWeekdayShort,
    isBeyondPlanningWindow,
} from './plannerDates';
import ProgressRing from './ProgressRing';
import './DayPlanner.css';

export type DayPlannerProps = {
    savedIngredients: UserIngredient[];
    onOpenRecipe: (recipe: Recipe) => void;
    // A meal was saved from the planner; Saved Meals should reload.
    onSavedMealsChanged: () => void;
    onEditGoals: () => void;
};

// How far past the planning window the next-day arrow goes, so a locked day
// can be seen (and the upgrade prompt reached).
const PEEK_DAYS = 7;

function groupByDate(meals: PlannedMeal[]) {
    const byDate = new Map<string, PlannedMeal[]>();

    for (const meal of meals) {
        const list = byDate.get(meal.entry.planDate) ?? [];

        list.push(meal);
        byDate.set(meal.entry.planDate, list);
    }

    return byDate;
}

function isSameTargets(a: Record<string, number>, b: Record<string, number>) {
    return Object.keys(b).every((key) => a[key] === b[key]);
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
                d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
            />
        </svg>
    );
}

function LockIcon() {
    return (
        <svg
            className="planner-lock"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

export default function DayPlanner({
    savedIngredients,
    onOpenRecipe,
    onSavedMealsChanged,
    onEditGoals,
}: DayPlannerProps) {
    const {
        profile,
        isLoading: isProfileLoading,
        limits,
        openPlans,
    } = usePlan();
    const todayKey = useMemo(() => toDateKey(new Date()), []);
    const [dateKey, setDateKey] = useState(todayKey);
    const [recipes, setRecipes] = useState<Recipe[] | null>(null);
    const [entries, setEntries] = useState<MealPlanEntry[]>([]);
    // Monday (key) of the week `entries` was loaded for.
    const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [addSlotId, setAddSlotId] = useState<string | null>(null);
    const [copying, setCopying] = useState<PlannedMeal | null>(null);

    const { targets } = profile;
    const weekStart = startOfWeek(fromDateKey(dateKey));
    const weekStartKey = toDateKey(weekStart);
    const weekDays = Array.from({ length: 7 }, (_, index) =>
        toDateKey(addDays(weekStart, index)),
    );
    const lastPlannableKey = toDateKey(
        addDays(fromDateKey(todayKey), limits.planningDaysAhead),
    );
    const lastReachableKey = toDateKey(
        addDays(fromDateKey(lastPlannableKey), PEEK_DAYS),
    );

    useEffect(() => {
        let cancelled = false;

        getRecipes()
            .then((loaded) => {
                if (!cancelled) setRecipes(loaded);
            })
            .catch((loadError) => {
                console.error(loadError);
                if (!cancelled) {
                    setRecipes([]);
                    setError('Could not load your saved meals.');
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const end = toDateKey(addDays(fromDateKey(weekStartKey), 6));

        getEntriesForRange(weekStartKey, end)
            .then((loaded) => {
                if (cancelled) return;
                setEntries(loaded);
                setLoadedWeek(weekStartKey);
            })
            .catch((loadError) => {
                console.error(loadError);
                if (cancelled) return;
                setEntries([]);
                setLoadedWeek(weekStartKey);
                setError('Could not load your meal plan.');
            });

        return () => {
            cancelled = true;
        };
    }, [weekStartKey]);

    const recipesById = useMemo(
        () => new Map((recipes ?? []).map((recipe) => [recipe.id, recipe])),
        [recipes],
    );
    const mealsByDate = useMemo(() => {
        const meals: PlannedMeal[] = [];

        for (const entry of entries) {
            const recipe = recipesById.get(entry.recipeId);

            if (recipe) meals.push({ entry, recipe });
        }

        return groupByDate(meals);
    }, [entries, recipesById]);

    const isLoading =
        recipes === null || loadedWeek !== weekStartKey || isProfileLoading;
    const slots = useMemo(() => sortSlots(profile.mealSlots), [profile]);
    const dayMeals = mealsByDate.get(dateKey) ?? [];
    const weekMeals = weekDays.flatMap((day) => mealsByDate.get(day) ?? []);
    const totals = sumNutrition(dayMeals);
    const slotIds = new Set(slots.map((slot) => slot.id));
    const otherMeals = dayMeals.filter(({ entry }) => !slotIds.has(entry.slot));
    const isLocked = isBeyondPlanningWindow(
        dateKey,
        todayKey,
        limits.planningDaysAhead,
    );
    const canReuse = limits.planReuseTools;

    function goToDay(key: string) {
        setDateKey(key);
        setNotice(null);
        setError(null);
        setAddSlotId(null);
    }

    // Only the visible week is loaded; other weeks fetch on navigation.
    function addLoadedEntry(entry: MealPlanEntry) {
        if (weekDays.includes(entry.planDate)) {
            setEntries((current) => [...current, entry]);
        }
    }

    function handleAdded(entry: MealPlanEntry, recipe: Recipe) {
        const isNewMeal = !recipesById.has(recipe.id);

        if (isNewMeal) {
            setRecipes((current) => [recipe, ...(current ?? [])]);
            onSavedMealsChanged();
        }
        addLoadedEntry(entry);
        setAddSlotId(null);
        setNotice(null);
    }

    async function handleServingsChange(
        entry: MealPlanEntry,
        servings: number,
    ) {
        const previous = entry.servings;

        setError(null);
        setEntries((current) =>
            current.map((item) =>
                item.id === entry.id ? { ...item, servings } : item,
            ),
        );

        try {
            await updateEntryServings(entry.id, servings);
        } catch (updateError) {
            console.error(updateError);
            setError('Could not change the servings. Please try again.');
            setEntries((current) =>
                current.map((item) =>
                    item.id === entry.id
                        ? { ...item, servings: previous }
                        : item,
                ),
            );
        }
    }

    async function handleRemove(entry: MealPlanEntry) {
        setError(null);
        setNotice(null);

        try {
            await removeEntry(entry.id);
            setEntries((current) =>
                current.filter((item) => item.id !== entry.id),
            );
        } catch (removeError) {
            console.error(removeError);
            setError('Could not remove that meal. Please try again.');
        }
    }

    // Copies a planned meal to another day/period; resolves to an error
    // message, or null on success.
    async function copyMeal(
        meal: PlannedMeal,
        date: string,
        slot: string,
    ): Promise<string | null> {
        setError(null);
        setNotice(null);

        if (isBeyondPlanningWindow(date, todayKey, limits.planningDaysAhead)) {
            return 'That day is beyond how far ahead your plan allows.';
        }

        try {
            const entry = await addEntry(
                date,
                slot,
                meal.recipe.id as string,
                meal.entry.servings,
            );

            addLoadedEntry(entry);
            setNotice(
                `Added ${meal.recipe.recipeName} to ${formatDayTitle(date, todayKey).toLowerCase()}`,
            );
            return null;
        } catch (copyError) {
            console.error(copyError);
            return 'Could not copy that meal. Please try again.';
        }
    }

    async function handleRepeatTomorrow(meal: PlannedMeal) {
        const tomorrow = toDateKey(
            addDays(fromDateKey(meal.entry.planDate), 1),
        );
        const problem = await copyMeal(meal, tomorrow, meal.entry.slot);

        if (problem) setError(problem);
    }

    async function handleAddToShoppingList(meals: PlannedMeal[]) {
        setError(null);
        setNotice(null);

        // Weights are per serving, so scale by the portions planned.
        const planned = meals.map(({ entry, recipe }) => ({
            ...recipe,
            servings: (recipe.servings ?? 1) * entry.servings,
        }));

        try {
            const count = await addItems(aggregateIngredients(planned));

            setNotice(
                count === 0
                    ? 'Nothing to add'
                    : `Added ${count} ${count === 1 ? 'item' : 'items'}`,
            );
        } catch (shoppingError) {
            console.error(shoppingError);
            setError('Could not update your shopping list.');
        }
    }

    function renderShoppingButton(label: string, meals: PlannedMeal[]) {
        return (
            <button
                type="button"
                className={`planner-shop${canReuse ? '' : ' planner-shop-locked'}`}
                disabled={canReuse && meals.length === 0}
                onClick={() =>
                    canReuse
                        ? handleAddToShoppingList(meals)
                        : openPlans('Shopping list tools')
                }
            >
                {!canReuse && <LockIcon />}
                {label}
            </button>
        );
    }

    const addSlot = slots.find((slot) => slot.id === addSlotId);
    const dayTitle = formatDayTitle(dateKey, todayKey);

    return (
        <main className="day-planner">
            <header className="list-page-header planner-header">
                <div>
                    <h1>{dayTitle}</h1>
                    <p>{formatLongDate(dateKey)}</p>
                </div>
                <nav className="planner-nav" aria-label="Choose day">
                    <button
                        type="button"
                        className="planner-nav-button"
                        onClick={() =>
                            goToDay(
                                toDateKey(addDays(fromDateKey(dateKey), -1)),
                            )
                        }
                        aria-label="Previous day"
                    >
                        <ChevronIcon direction="left" />
                    </button>
                    <button
                        type="button"
                        className="planner-today"
                        disabled={dateKey === todayKey}
                        onClick={() => goToDay(todayKey)}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        className="planner-nav-button"
                        disabled={dateKey >= lastReachableKey}
                        onClick={() =>
                            goToDay(toDateKey(addDays(fromDateKey(dateKey), 1)))
                        }
                        aria-label="Next day"
                    >
                        <ChevronIcon direction="right" />
                    </button>
                </nav>
            </header>

            <ol className="week-strip" aria-label="This week">
                {weekDays.map((day) => {
                    const dayKcal = sumNutrition(
                        mealsByDate.get(day) ?? [],
                    ).calories;
                    const locked = isBeyondPlanningWindow(
                        day,
                        todayKey,
                        limits.planningDaysAhead,
                    );
                    const isSelected = day === dateKey;

                    return (
                        <li key={day}>
                            <button
                                type="button"
                                className={`week-day${isSelected ? ' week-day-selected' : ''}${
                                    day === todayKey ? ' week-day-today' : ''
                                }${locked ? ' week-day-locked' : ''}`}
                                aria-current={isSelected ? 'date' : undefined}
                                aria-label={`${formatShortDate(day)}${
                                    locked
                                        ? ', locked'
                                        : `, ${Math.round(dayKcal)} of ${targets.calories} kcal planned`
                                }`}
                                onClick={() => goToDay(day)}
                            >
                                <span className="week-day-name">
                                    {formatWeekdayShort(day)}
                                </span>
                                <ProgressRing
                                    value={locked ? 0 : dayKcal}
                                    max={targets.calories}
                                    size={38}
                                    strokeWidth={4}
                                >
                                    {locked ? (
                                        <LockIcon />
                                    ) : (
                                        <span className="week-day-number">
                                            {fromDateKey(day).getDate()}
                                        </span>
                                    )}
                                </ProgressRing>
                                <span className="week-day-kcal">
                                    {!locked && dayKcal > 0
                                        ? `${Math.round(dayKcal).toLocaleString('en')}`
                                        : ' '}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>

            {notice && (
                <p className="planner-notice" role="status">
                    {notice}
                </p>
            )}
            {error && (
                <p className="planner-error" role="alert">
                    {error}
                </p>
            )}

            {isLocked ? (
                <div className="planner-locked">
                    {limits.planningDaysAhead <
                    PLAN_LIMITS.pro.planningDaysAhead ? (
                        <UpgradeNotice
                            feature="Plan further ahead"
                            description={`Your plan covers today and the next ${limits.planningDaysAhead} ${
                                limits.planningDaysAhead === 1 ? 'day' : 'days'
                            }. Upgrade to schedule up to ${PLAN_LIMITS.pro.planningDaysAhead} days out.`}
                        />
                    ) : (
                        <p className="planner-empty">
                            That&apos;s further ahead than you can plan.
                        </p>
                    )}
                </div>
            ) : isLoading ? (
                <div
                    className="planner-layout planner-skeleton"
                    role="status"
                    aria-label="Loading your day"
                >
                    <div className="planner-skeleton-block planner-skeleton-summary" />
                    <div className="planner-skeleton-column">
                        <div className="planner-skeleton-block" />
                        <div className="planner-skeleton-block" />
                        <div className="planner-skeleton-block" />
                    </div>
                </div>
            ) : (
                <div className="planner-layout">
                    <DaySummary
                        totals={totals}
                        micronutrients={sumDayMicronutrients(dayMeals)}
                        targets={targets}
                        hasMeals={dayMeals.length > 0}
                        usesDefaultGoals={isSameTargets(
                            targets,
                            DEFAULT_TARGETS,
                        )}
                        onEditGoals={onEditGoals}
                    />

                    <div className="planner-periods">
                        <div className="planner-periods-toolbar">
                            <h2>Meals</h2>
                            <div className="planner-shop-actions">
                                {renderShoppingButton(
                                    'Add this day to shopping list',
                                    dayMeals,
                                )}
                                {renderShoppingButton(
                                    'Add week to shopping list',
                                    weekMeals,
                                )}
                            </div>
                        </div>

                        {slots.map((slot) => (
                            <MealPeriodCard
                                key={slot.id}
                                slot={slot}
                                meals={dayMeals.filter(
                                    ({ entry }) => entry.slot === slot.id,
                                )}
                                budgetCalories={getSlotShareCalories(
                                    targets,
                                    slot,
                                )}
                                canReuse={canReuse}
                                onAdd={() => setAddSlotId(slot.id)}
                                onOpenRecipe={onOpenRecipe}
                                onServingsChange={handleServingsChange}
                                onRemove={handleRemove}
                                onRepeatTomorrow={handleRepeatTomorrow}
                                onCopy={setCopying}
                                onLockedReuse={() =>
                                    openPlans('Plan reuse tools')
                                }
                            />
                        ))}

                        {otherMeals.length > 0 && (
                            <MealPeriodCard
                                meals={otherMeals}
                                canReuse={canReuse}
                                onOpenRecipe={onOpenRecipe}
                                onServingsChange={handleServingsChange}
                                onRemove={handleRemove}
                                onRepeatTomorrow={handleRepeatTomorrow}
                                onCopy={setCopying}
                                onLockedReuse={() =>
                                    openPlans('Plan reuse tools')
                                }
                            />
                        )}
                    </div>
                </div>
            )}

            {addSlot && (
                <AddMealSheet
                    date={dateKey}
                    dateLabel={dayTitle}
                    slot={addSlot}
                    budget={getSlotBudget({
                        targets,
                        slots,
                        slot: addSlot,
                        meals: dayMeals,
                    })}
                    targets={targets}
                    plannedSoFar={totals}
                    focusNutrients={getFocusNutrients({
                        targets,
                        meals: dayMeals,
                    })}
                    savedIngredients={savedIngredients}
                    recipes={recipes ?? []}
                    onAdded={handleAdded}
                    onClose={() => setAddSlotId(null)}
                />
            )}

            {copying && (
                <CopyMealDialog
                    meal={copying}
                    slots={slots}
                    todayKey={todayKey}
                    lastDateKey={lastPlannableKey}
                    initialDate={toDateKey(
                        addDays(fromDateKey(copying.entry.planDate), 1),
                    )}
                    onCopy={async (date, slot) => {
                        const problem = await copyMeal(copying, date, slot);

                        if (!problem) setCopying(null);

                        return problem;
                    }}
                    onClose={() => setCopying(null)}
                />
            )}
        </main>
    );
}
