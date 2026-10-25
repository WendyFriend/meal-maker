import { useEffect, useMemo, useState } from 'react';
import type {
    MealPlanEntry,
    MealPlanSlot,
    Recipe,
} from '../shared/types/recipe';
import RecipePickerDialog from './RecipePickerDialog';
import { getRecipes } from './services/recipeService';
import {
    MEAL_PLAN_SLOTS,
    addDays,
    addEntry,
    getEntriesForRange,
    getRecipeCalories,
    getWeekDates,
    removeEntry,
    startOfWeek,
    toDateKey,
} from './services/mealPlanService';
import { addItems, aggregateIngredients } from './services/shoppingListService';
import './MealPlan.css';

type MealPlanProps = {
    onOpenRecipe: (recipe: Recipe) => void;
};

type PickerTarget = { date: string; slot: MealPlanSlot };

const SLOT_LABELS: Record<MealPlanSlot, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
};

const monthDay = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
});
const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' });

function formatWeekRange(days: Date[]) {
    return `${monthDay.format(days[0])} – ${monthDay.format(days[6])}`;
}

export default function MealPlan({ onOpenRecipe }: MealPlanProps) {
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [entries, setEntries] = useState<MealPlanEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [picker, setPicker] = useState<PickerTarget | null>(null);

    const days = useMemo(() => getWeekDates(weekStart), [weekStart]);
    const todayKey = toDateKey(new Date());
    const recipesById = useMemo(
        () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
        [recipes],
    );

    useEffect(() => {
        getRecipes()
            .then(setRecipes)
            .catch((error) => {
                console.error(error);
                setError('Could not load your recipes. Please try again.');
            });
    }, []);

    useEffect(() => {
        let cancelled = false;

        getEntriesForRange(toDateKey(days[0]), toDateKey(days[6]))
            .then((loaded) => {
                if (!cancelled) {
                    setEntries(loaded);
                    setError(null);
                }
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) {
                    setError('Could not load your meal plan.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [days]);

    function changeWeek(nextStart: Date) {
        setNotice(null);
        setWeekStart(nextStart);
    }

    async function handlePick(recipe: Recipe) {
        if (!picker || !recipe.id) {
            return;
        }

        const target = picker;
        setPicker(null);

        try {
            const entry = await addEntry(target.date, target.slot, recipe.id);
            setEntries((current) => [...current, entry]);
        } catch (error) {
            console.error(error);
            setError('Could not add that meal. Please try again.');
        }
    }

    async function handleRemove(entry: MealPlanEntry) {
        try {
            await removeEntry(entry.id);
            setEntries((current) =>
                current.filter((item) => item.id !== entry.id),
            );
        } catch (error) {
            console.error(error);
            setError('Could not remove that meal. Please try again.');
        }
    }

    async function handleAddToShoppingList() {
        const planned = entries
            .map((entry) => recipesById.get(entry.recipeId))
            .filter((recipe): recipe is Recipe => recipe !== undefined);

        try {
            const count = await addItems(aggregateIngredients(planned));
            setNotice(
                count === 0
                    ? 'Nothing to add'
                    : `Added ${count} ${count === 1 ? 'item' : 'items'}`,
            );
        } catch (error) {
            console.error(error);
            setError('Could not update your shopping list.');
        }
    }

    const hasPlannedMeals = entries.some((entry) =>
        recipesById.has(entry.recipeId),
    );
    const isThisWeek =
        toDateKey(weekStart) === toDateKey(startOfWeek(new Date()));

    return (
        <main className="meal-plan">
            <header className="list-page-header">
                <h1>Meal Plan</h1>
                <p>Plan your week of meals</p>
            </header>

            <div className="meal-plan-toolbar">
                <div className="meal-plan-nav">
                    <button
                        type="button"
                        className="meal-plan-nav-button"
                        onClick={() => changeWeek(addDays(weekStart, -7))}
                        aria-label="Previous week"
                    >
                        ‹
                    </button>
                    <span className="meal-plan-range">
                        {formatWeekRange(days)}
                    </span>
                    <button
                        type="button"
                        className="meal-plan-nav-button"
                        onClick={() => changeWeek(addDays(weekStart, 7))}
                        aria-label="Next week"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        className="meal-plan-today"
                        disabled={isThisWeek}
                        onClick={() => changeWeek(startOfWeek(new Date()))}
                    >
                        This week
                    </button>
                </div>
                <button
                    type="button"
                    className="meal-plan-shop"
                    disabled={!hasPlannedMeals}
                    onClick={handleAddToShoppingList}
                >
                    Add week to shopping list
                </button>
            </div>

            {notice && (
                <p className="meal-plan-notice" role="status">
                    {notice}
                </p>
            )}
            {error && (
                <p className="meal-plan-error" role="alert">
                    {error}
                </p>
            )}

            {isLoading ? (
                <p className="meal-plan-loading" role="status">
                    Loading your meal plan...
                </p>
            ) : recipes.length === 0 ? (
                <div className="meal-plan-empty">
                    <div className="meal-plan-empty-icon" aria-hidden="true">
                        🗓️
                    </div>
                    <p className="meal-plan-empty-title">
                        No saved recipes yet
                    </p>
                    <p className="meal-plan-empty-hint">
                        Save a meal from Create Meal or My Recipes, then plan it
                        here.
                    </p>
                </div>
            ) : (
                <div className="meal-plan-grid">
                    {days.map((day) => {
                        const key = toDateKey(day);
                        const dayEntries = entries.filter(
                            (entry) =>
                                entry.planDate === key &&
                                recipesById.has(entry.recipeId),
                        );
                        const dayKcal = dayEntries.reduce(
                            (total, entry) =>
                                total +
                                getRecipeCalories(
                                    recipesById.get(entry.recipeId) as Recipe,
                                ),
                            0,
                        );

                        return (
                            <section
                                key={key}
                                className={
                                    key === todayKey
                                        ? 'meal-plan-day meal-plan-day-today'
                                        : 'meal-plan-day'
                                }
                                aria-label={`${weekday.format(day)} ${monthDay.format(day)}`}
                            >
                                <header className="meal-plan-day-header">
                                    <span className="meal-plan-day-name">
                                        {weekday.format(day)}
                                    </span>
                                    <span className="meal-plan-day-date">
                                        {monthDay.format(day)}
                                    </span>
                                    {dayEntries.length > 0 && (
                                        <span className="list-row-kcal">
                                            {Math.round(dayKcal)} kcal
                                        </span>
                                    )}
                                </header>
                                {MEAL_PLAN_SLOTS.map((slot) => {
                                    const slotEntries = dayEntries.filter(
                                        (entry) => entry.slot === slot,
                                    );

                                    return (
                                        <div
                                            key={slot}
                                            className="meal-plan-slot"
                                        >
                                            <span className="meal-plan-slot-label">
                                                {SLOT_LABELS[slot]}
                                            </span>
                                            {slotEntries.map((entry) => {
                                                const recipe = recipesById.get(
                                                    entry.recipeId,
                                                ) as Recipe;

                                                return (
                                                    <div
                                                        key={entry.id}
                                                        className="meal-plan-entry"
                                                    >
                                                        <button
                                                            type="button"
                                                            className="meal-plan-entry-open"
                                                            onClick={() =>
                                                                onOpenRecipe(
                                                                    recipe,
                                                                )
                                                            }
                                                        >
                                                            <strong>
                                                                {
                                                                    recipe.recipeName
                                                                }
                                                            </strong>
                                                            <span>
                                                                {Math.round(
                                                                    getRecipeCalories(
                                                                        recipe,
                                                                    ),
                                                                )}{' '}
                                                                kcal
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="meal-plan-entry-remove"
                                                            onClick={() =>
                                                                handleRemove(
                                                                    entry,
                                                                )
                                                            }
                                                            aria-label={`Remove ${recipe.recipeName}`}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {slotEntries.length === 0 && (
                                                <button
                                                    type="button"
                                                    className="meal-plan-add"
                                                    onClick={() =>
                                                        setPicker({
                                                            date: key,
                                                            slot,
                                                        })
                                                    }
                                                    aria-label={`Add ${SLOT_LABELS[slot]} on ${weekday.format(day)}`}
                                                >
                                                    + Add
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </section>
                        );
                    })}
                </div>
            )}

            {picker && (
                <RecipePickerDialog
                    title={`Add ${SLOT_LABELS[picker.slot].toLowerCase()}`}
                    recipes={recipes}
                    onPick={handlePick}
                    onClose={() => setPicker(null)}
                />
            )}
        </main>
    );
}
