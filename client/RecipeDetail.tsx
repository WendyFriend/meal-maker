import { useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import type { GenerateMealResponse } from '../shared/types/types';
import MealResult from './meal-generator/components/NewMealResult';
import { updateRecipe } from './services/recipeService';
import './RecipeDetail.css';

type RecipeDetailProps = {
    recipe: Recipe;
    /* Called with the stored recipe after "Save changes" succeeds. */
    onRecipeUpdated?: (recipe: Recipe) => void;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
        servings: recipe.servings,
    };
}

function haveSameWeights(
    a: GenerateMealResponse,
    b: GenerateMealResponse,
): boolean {
    return (
        a.ingredients.length === b.ingredients.length &&
        a.ingredients.every(
            (ingredient, index) =>
                ingredient.weight === b.ingredients[index].weight,
        )
    );
}

/*
 * Detail page for a saved recipe.
 *
 * Renders the same sections as the meal result on the meal maker page:
 * Ingredients, Nutrition (macro donut + tables, vitamins and minerals),
 * Preparation & safety (worked out from the ingredients, since saved
 * recipes don't store it), Instructions, and Ingredient Nutrition
 * Information.
 *
 * The bookmark button is hidden — the recipe is already saved, and "Add to
 * plan" uses the stored recipe rather than saving a copy. Ingredient
 * weight tweaks stay local until the user presses "Save changes", which
 * writes them to the saved recipe.
 */
export default function RecipeDetail({
    recipe,
    onRecipeUpdated,
}: RecipeDetailProps) {
    /*
     * The saved meal. MealResult's Reset button restores weights from
     * `originalMeal`, so it must stay frozen while `meal` below is edited —
     * passing `meal` itself would make Reset restore the already-tweaked
     * values. It only changes when the edits are saved.
     */
    const [originalMeal, setOriginalMeal] = useState<GenerateMealResponse>(() =>
        toMeal(recipe),
    );

    // Local copy of the recipe so weight tweaks stay on this page.
    const [meal, setMeal] = useState<GenerateMealResponse>(originalMeal);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

    const hasChanges = !haveSameWeights(meal, originalMeal);

    async function saveChanges() {
        if (!recipe.id || saveStatus === 'saving') return;

        setSaveStatus('saving');

        try {
            const updated = await updateRecipe(recipe.id, {
                ...recipe,
                ingredients: meal.ingredients,
            });

            setOriginalMeal(toMeal(updated));
            setSaveStatus('saved');
            onRecipeUpdated?.(updated);
        } catch (error) {
            console.error('Failed to save recipe changes:', error);
            setSaveStatus('error');
        }
    }

    return (
        <div className="recipe-detail">
            <MealResult
                meal={meal}
                originalMeal={originalMeal}
                onChange={(next) => {
                    setMeal(next);
                    setSaveStatus('idle');
                }}
                showBookmark={false}
                mealType={recipe.mealType}
                savedRecipeId={recipe.id}
                saveChanges={
                    recipe.id
                        ? {
                              hasChanges,
                              status: saveStatus,
                              onSave: saveChanges,
                          }
                        : undefined
                }
            />
        </div>
    );
}
