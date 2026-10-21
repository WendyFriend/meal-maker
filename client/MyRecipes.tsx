import { useEffect, useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import type { MealIngredient } from '../shared/types/types';
import { getRecipes } from './services/recipeService';
import './MyRecipes.css';

/*
 * Total calories of a recipe: sum of each ingredient's calories scaled by
 * its weight (calories are stored per 100g).
 */
function getTotalCalories(ingredients: MealIngredient[]): number {
    return ingredients.reduce(
        (total, ingredient) =>
            total + (ingredient.caloriesPer100g * ingredient.weight) / 100,
        0,
    );
}

type MyRecipesProps = {
    onOpenRecipe: (recipe: Recipe) => void;
};

export default function MyRecipes({ onOpenRecipe }: MyRecipesProps) {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // App keeps this page mounted while Recipe Detail is open, preserving
    // the list state when the user returns. `reloadCount` supports retries.
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        async function loadRecipes() {
            try {
                const recipes = await getRecipes();
                setRecipes(recipes);
            } catch (error) {
                console.error(error);
                setError('Could not load your recipes. Please try again.');
            } finally {
                setIsLoading(false);
            }
        }

        loadRecipes();
    }, [reloadCount]);

    if (isLoading) {
        return (
            <main className="my-recipes">
                <div className="my-recipes-status" role="status">
                    <span className="my-recipes-spinner" aria-hidden="true" />
                    <p>Loading your recipes...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="my-recipes">
            {error ? (
                <div className="my-recipes-error" role="alert">
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setIsLoading(true);
                            setRecipes([]);
                            setReloadCount((count) => count + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            ) : recipes.length === 0 ? (
                <div className="my-recipes-empty">
                    <div className="my-recipes-empty-icon" aria-hidden="true">
                        📖
                    </div>
                    <p className="my-recipes-empty-title">
                        No saved recipes yet
                    </p>
                    <p className="my-recipes-empty-hint">
                        Create a meal and tap the bookmark to save it here.
                    </p>
                </div>
            ) : (
                <div className="recipe-list">
                    {recipes.map((recipe, index) => (
                        <button
                            type="button"
                            key={recipe.id ?? `${recipe.recipeName}-${index}`}
                            className="recipe-row"
                            onClick={() => onOpenRecipe(recipe)}
                        >
                            <span className="recipe-icon" aria-hidden="true">
                                🍲
                            </span>

                            <span className="recipe-row-info">
                                <strong>{recipe.recipeName}</strong>

                                <span>
                                    {recipe.ingredients.length}{' '}
                                    {recipe.ingredients.length === 1
                                        ? 'ingredient'
                                        : 'ingredients'}{' '}
                                    •{' '}
                                    {Math.round(
                                        getTotalCalories(recipe.ingredients),
                                    )}
                                    kcal
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </main>
    );
}
