import { useMemo, useState } from 'react';
import type { MealSlotConfig } from '../../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import { addEntry } from '../services/mealPlanService';
import {
    fitsBudget,
    getRecipeNutrition,
    scaleNutrition,
    type SlotBudget,
} from './budget';
import { SERVING_OPTIONS, formatServings } from './servings';

type SavedMealsTabProps = {
    date: string;
    slot: MealSlotConfig;
    budget: SlotBudget;
    recipes: Recipe[];
    onAdded: (entry: MealPlanEntry, recipe: Recipe) => void;
    onRecommend: () => void;
};

export default function SavedMealsTab({
    date,
    slot,
    budget,
    recipes,
    onAdded,
    onRecommend,
}: SavedMealsTabProps) {
    const [query, setQuery] = useState('');
    const [servings, setServings] = useState(1);
    const [addingId, setAddingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Closest to the period's budget first.
    const rows = useMemo(() => {
        const search = query.trim().toLowerCase();

        return recipes
            .filter((recipe) =>
                recipe.recipeName.toLowerCase().includes(search),
            )
            .map((recipe) => ({
                recipe,
                nutrition: scaleNutrition(getRecipeNutrition(recipe), servings),
            }))
            .sort(
                (a, b) =>
                    Math.abs(a.nutrition.calories - budget.calories) -
                    Math.abs(b.nutrition.calories - budget.calories),
            );
    }, [recipes, query, servings, budget.calories]);

    async function handlePick(recipe: Recipe) {
        if (!recipe.id || addingId) return;

        setAddingId(recipe.id);
        setError(null);

        try {
            const entry = await addEntry(date, slot.id, recipe.id, servings);

            onAdded(entry, recipe);
        } catch (error) {
            console.error(error);
            setError('Could not add that meal. Please try again.');
            setAddingId(null);
        }
    }

    if (recipes.length === 0) {
        return (
            <div className="add-sheet-empty">
                <p className="add-sheet-empty-title">No saved meals yet</p>
                <p className="add-sheet-hint">
                    Meals you add from a recommendation are saved here, so you
                    can reuse them on other days.
                </p>
                <button
                    type="button"
                    className="add-sheet-secondary"
                    onClick={onRecommend}
                >
                    Recommend a meal
                </button>
            </div>
        );
    }

    return (
        <div className="add-sheet-panel">
            <div className="add-sheet-filter">
                <input
                    type="search"
                    className="add-sheet-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search saved meals"
                    aria-label="Search saved meals"
                />
                <label className="add-sheet-servings">
                    <span>Servings</span>
                    <select
                        value={servings}
                        onChange={(event) =>
                            setServings(Number(event.target.value))
                        }
                    >
                        {SERVING_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {formatServings(option)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="add-sheet-scroll add-sheet-scroll-list">
                {error && (
                    <p className="add-sheet-error" role="alert">
                        {error}
                    </p>
                )}
                {rows.length === 0 ? (
                    <p className="add-sheet-hint add-sheet-no-match">
                        No saved meals match &ldquo;{query.trim()}&rdquo;.
                    </p>
                ) : (
                    <ul className="add-sheet-meals">
                        {rows.map(({ recipe, nutrition }) => (
                            <li key={recipe.id ?? recipe.recipeName}>
                                <button
                                    type="button"
                                    className="add-sheet-meal"
                                    onClick={() => handlePick(recipe)}
                                    disabled={addingId !== null}
                                >
                                    <span className="add-sheet-meal-top">
                                        <strong>{recipe.recipeName}</strong>
                                        <span className="list-row-kcal">
                                            {Math.round(nutrition.calories)}{' '}
                                            kcal
                                        </span>
                                    </span>
                                    <span className="add-sheet-meal-bottom">
                                        <span>
                                            P {Math.round(nutrition.proteinG)} g
                                            · C {Math.round(nutrition.carbsG)} g
                                            · F {Math.round(nutrition.fatG)} g
                                        </span>
                                        {fitsBudget(
                                            nutrition.calories,
                                            budget.calories,
                                        ) && (
                                            <span className="add-sheet-fits">
                                                Fits budget
                                            </span>
                                        )}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
