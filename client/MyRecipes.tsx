import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import type { MealIngredient } from '../shared/types/types';
import { getRecipes } from './services/recipeService';
import { getPrepConsiderations } from '../shared/nutrition/prepGuidance';
import { usePlan } from './plan/PlanContext';
import UpgradeNotice from './plan/UpgradeNotice';
import './MyRecipes.css';

type SourceFilter = 'all' | 'generated' | 'manual';

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'generated', label: 'AI meals' },
    { id: 'manual', label: 'My recipes' },
];

function getMacroGrams(ingredients: MealIngredient[]) {
    return ingredients.reduce(
        (totals, ingredient) => {
            const factor = ingredient.weight / 100;
            totals.protein += ingredient.proteinPer100g * factor;
            totals.carbs += ingredient.carbohydratePer100g * factor;
            totals.fat += ingredient.fatPer100g * factor;
            return totals;
        },
        { protein: 0, carbs: 0, fat: 0 },
    );
}

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

function ListHeader({
    count,
    limit,
}: {
    count?: number;
    limit?: number | null;
}) {
    return (
        <header className="list-page-header">
            <h1>Saved Meals</h1>
            <p>
                {count === undefined
                    ? 'AI meals and recipes you have saved'
                    : limit != null
                      ? `${count} of ${limit} saved on Free`
                      : count === 1
                        ? '1 saved meal'
                        : `${count} saved meals`}
            </p>
        </header>
    );
}

type MyRecipesProps = {
    onOpenRecipe: (recipe: Recipe) => void;
    onCreateRecipe: () => void;
    showAddButton: boolean;
};

export default function MyRecipes({
    onOpenRecipe,
    onCreateRecipe,
    showAddButton,
}: MyRecipesProps) {
    const { limits } = usePlan();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [showLimitNotice, setShowLimitNotice] = useState(false);
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

    const savedLimit = limits.savedMeals;
    const isAtLimit = savedLimit !== null && recipes.length >= savedLimit;
    const visibleRecipes =
        sourceFilter === 'all'
            ? recipes
            : recipes.filter(
                  (recipe) => (recipe.source ?? 'manual') === sourceFilter,
              );
    const hasBothSources =
        recipes.some((recipe) => recipe.source === 'generated') &&
        recipes.some((recipe) => (recipe.source ?? 'manual') === 'manual');

    function handleCreate() {
        if (isAtLimit) {
            setShowLimitNotice(true);
            return;
        }
        onCreateRecipe();
    }

    const addButton = showAddButton
        ? createPortal(
              <button
                  type="button"
                  className="floating-add-button"
                  onClick={handleCreate}
                  aria-label="Create recipe"
              >
                  <span aria-hidden="true">+</span>
              </button>,
              document.body,
          )
        : null;

    if (isLoading) {
        return (
            <>
                <main className="my-recipes">
                    <ListHeader />
                    <div className="my-recipes-status" role="status">
                        <span
                            className="my-recipes-spinner"
                            aria-hidden="true"
                        />
                        <p>Loading your recipes...</p>
                    </div>
                </main>
                {addButton}
            </>
        );
    }

    return (
        <>
            <main className="my-recipes">
                <ListHeader
                    count={error ? undefined : recipes.length}
                    limit={savedLimit}
                />
                {showLimitNotice && isAtLimit && savedLimit !== null && (
                    <div className="my-recipes-limit">
                        <UpgradeNotice
                            feature="Saved meal limit reached"
                            description={`The Free plan keeps up to ${savedLimit} meals. Remove one, or upgrade for unlimited.`}
                        />
                    </div>
                )}
                {!error && hasBothSources && (
                    <div
                        className="recipe-filters"
                        role="group"
                        aria-label="Show"
                    >
                        {SOURCE_FILTERS.map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                className="ingredient-filter-chip"
                                aria-pressed={sourceFilter === id}
                                onClick={() => setSourceFilter(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
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
                        <div
                            className="my-recipes-empty-icon"
                            aria-hidden="true"
                        >
                            📖
                        </div>
                        <p className="my-recipes-empty-title">
                            No saved meals yet
                        </p>
                        <p className="my-recipes-empty-hint">
                            Create a meal and tap the bookmark to save it, or
                            add one to your day plan.
                        </p>
                    </div>
                ) : (
                    <div className="recipe-list">
                        {visibleRecipes.map((recipe, index) => {
                            const macros = getMacroGrams(recipe.ingredients);
                            const mustPrep = getPrepConsiderations(
                                recipe.ingredients.map((i) => i.name),
                            ).some((c) => c.severity === 'required');

                            return (
                                <button
                                    type="button"
                                    key={
                                        recipe.id ??
                                        `${recipe.recipeName}-${index}`
                                    }
                                    className="recipe-row"
                                    onClick={() => onOpenRecipe(recipe)}
                                >
                                    <span
                                        className="recipe-icon"
                                        aria-hidden="true"
                                    >
                                        🍲
                                    </span>
                                    <span className="recipe-row-info">
                                        <strong>{recipe.recipeName}</strong>
                                        <span>
                                            {recipe.ingredients
                                                .map(
                                                    (ingredient) =>
                                                        ingredient.name,
                                                )
                                                .join(', ')}
                                        </span>
                                        <span className="recipe-row-meta">
                                            {recipe.source === 'generated' && (
                                                <span className="recipe-tag">
                                                    AI meal
                                                </span>
                                            )}
                                            {mustPrep && (
                                                <span className="recipe-tag recipe-tag-prep">
                                                    Prep required
                                                </span>
                                            )}
                                            <span>
                                                P {Math.round(macros.protein)}g
                                                · C {Math.round(macros.carbs)}g
                                                · F {Math.round(macros.fat)}g
                                            </span>
                                        </span>
                                    </span>
                                    <span className="list-row-kcal">
                                        {Math.round(
                                            getTotalCalories(
                                                recipe.ingredients,
                                            ),
                                        )}{' '}
                                        kcal
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </main>
            {addButton}
        </>
    );
}
