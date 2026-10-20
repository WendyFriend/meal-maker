import { useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import type { GenerateMealResponse } from '../shared/types/types';
import MealResult from './meal-generator/components/NewMealResult';
import './RecipeDetail.css';

type RecipeDetailProps = {
    recipe: Recipe;
};

/*
 * Maps a saved recipe to the meal shape rendered by MealResult.
 */
function toMeal(recipe: Recipe): GenerateMealResponse {
    return {
        mealName: recipe.recipeName,
        ingredients: recipe.ingredients.map((ingredient) => ({
            ...ingredient,
        })),
        instructions: [...recipe.instructions],
    };
}

/*
 * Read-only detail page for a saved recipe.
 *
 * Renders the same sections as the meal result on the meal maker page:
 * Ingredients, Nutrition (macro donut + tables), Instructions, Key
 * nutrients, and Ingredient Nutrition Information.
 *
 * The bookmark button is hidden — the recipe is already saved. The
 * ingredient weight controls remain interactive: tweaks are kept in local
 * state only, so the saved recipe in the database is left untouched.
 */
export default function RecipeDetail({ recipe }: RecipeDetailProps) {
    /*
     * The saved meal is captured once on mount. MealResult's Reset button
     * restores weights from `originalMeal`, so it must stay frozen while
     * `meal` below is edited — passing `meal` itself would make Reset
     * restore the already-tweaked values.
     */
    const [originalMeal] = useState<GenerateMealResponse>(() => toMeal(recipe));

    // Local copy of the recipe so weight tweaks stay on this page.
    const [meal, setMeal] = useState<GenerateMealResponse>(originalMeal);

    return (
        <div className="recipe-detail">
            <MealResult
                meal={meal}
                originalMeal={originalMeal}
                onChange={setMeal}
                showBookmark={false}
            />
        </div>
    );
}
