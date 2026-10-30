import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import { totalNutrition } from './utils/nutrition';
import { getRecipes, deleteRecipes } from './services/recipeService';
import { useCollectionSelection } from './hooks/useCollectionSelection';
import {
    SelectionToggle,
    SelectionControls,
    SelectionIndicator,
    BulkDeleteToolbar,
} from './components/CollectionSelection';
import './components/SavedCollection.css';
import './MyMeals.css';
import LoadingSpinner from './components/LoadingSpinner';

export default function MyMeals({
    onOpenRecipe,
    isActive = true,
    updatedRecipes = {},
}: {
    onOpenRecipe: (recipe: Recipe) => void;
    isActive?: boolean;
    updatedRecipes?: Record<string, Recipe>;
}) {
    const [loadedRecipes, setRecipes] = useState<Recipe[]>([]);
    const recipes = loadedRecipes.map(
        (recipe) => (recipe.id && updatedRecipes[recipe.id]) || recipe,
    );
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadCount, setReloadCount] = useState(0);

    // Keep the loaded list and search while a meal detail or create page is open.
    useEffect(() => {
        let active = true;
        async function loadMeals() {
            try {
                const saved = await getRecipes();
                if (active) setRecipes(saved);
            } catch {
                if (active)
                    setError('Could not load your meals. Please try again.');
            } finally {
                if (active) setIsLoading(false);
            }
        }
        void loadMeals();
        return () => {
            active = false;
        };
    }, [reloadCount]);

    const query = search.trim().toLowerCase();
    const filtered = recipes.filter(
        (recipe) =>
            recipe.recipeName.toLowerCase().includes(query) ||
            recipe.ingredients.some((ingredient) =>
                ingredient.name.toLowerCase().includes(query),
            ),
    );

    async function deleteMeals(ids: string[]) {
        const deleted = await deleteRecipes(ids);
        const removed = new Set(deleted);
        setRecipes((current) =>
            current.filter((recipe) => !recipe.id || !removed.has(recipe.id)),
        );
        return deleted;
    }
    const {
        selecting,
        deleting,
        error: deleteError,
        selectedItems,
        allVisibleSelected,
        selectAllLabel,
        isSelected,
        selectableCount,
        startPress,
        movePress,
        endPress,
        clickItem,
        cancelSelection,
        toggleSelection,
        toggleVisible,
        deleteSelected,
        resetClickSuppression,
    } = useCollectionSelection({
        items: recipes,
        visibleItems: filtered,
        getId: (recipe) => recipe.id ?? '',
        onOpen: onOpenRecipe,
        onDeleteMany: deleteMeals,
        noun: 'meal',
        search,
        isActive,
    });

    return (
        <section
            className={`my-meals saved-collection${selecting ? ' saved-collection-selecting' : ''}`}
            aria-labelledby="my-meals-heading"
            hidden={!isActive}
            inert={!isActive}
            aria-busy={deleting}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && selecting) {
                    event.preventDefault();
                    cancelSelection();
                }
            }}
        >
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <h1 id="my-meals-heading">My Meals</h1>
                    {!isLoading && !error && (
                        <span>{recipes.length} saved</span>
                    )}
                    {!isLoading &&
                        !error &&
                        recipes.some((recipe) => recipe.id) && (
                            <SelectionToggle
                                selecting={selecting}
                                disabled={deleting}
                                noun="meal"
                                onClick={toggleSelection}
                            />
                        )}
                </div>
                <p>Your favourite meals, ready to make again.</p>
            </header>
            <div className="saved-collection-search-field">
                <span
                    className="saved-collection-search-icon"
                    aria-hidden="true"
                >
                    <svg viewBox="0 0 24 24" fill="none">
                        <circle cx="10.8" cy="10.8" r="6.8" />
                        <path d="m16 16 4.2 4.2" />
                    </svg>
                </span>
                <input
                    type="search"
                    className="saved-collection-search-input"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search meals..."
                    aria-label="Search meals"
                    disabled={deleting}
                />
            </div>
            {selecting && (
                <SelectionControls
                    count={selectedItems.length}
                    allVisibleSelected={allVisibleSelected}
                    label={selectAllLabel}
                    disabled={deleting || selectableCount === 0}
                    onToggle={toggleVisible}
                />
            )}
            {isLoading ? (
                <div
                    className="saved-collection-empty my-meals-loading"
                    role="status"
                >
                    <LoadingSpinner />
                    <p>Loading your meals…</p>
                </div>
            ) : error ? (
                <div className="my-meals-error" role="alert">
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setIsLoading(true);
                            setReloadCount((count) => count + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            ) : filtered.length ? (
                <div className="saved-collection-list">
                    {filtered.map((recipe, index) => {
                        const selected = isSelected(recipe);
                        return (
                            <div
                                className={`saved-collection-row-wrapper${selected ? ' saved-collection-row-wrapper-selected' : ''}`}
                                key={
                                    recipe.id ?? `${recipe.recipeName}-${index}`
                                }
                            >
                                <button
                                    type="button"
                                    className="saved-collection-row"
                                    aria-pressed={
                                        selecting ? selected : undefined
                                    }
                                    aria-label={
                                        selecting
                                            ? `${selected ? 'Deselect' : 'Select'} ${recipe.recipeName}`
                                            : undefined
                                    }
                                    disabled={deleting}
                                    onPointerDown={(event) =>
                                        startPress(event, recipe)
                                    }
                                    onPointerMove={movePress}
                                    onPointerUp={endPress}
                                    onPointerCancel={endPress}
                                    onPointerLeave={endPress}
                                    onContextMenu={(event) =>
                                        event.preventDefault()
                                    }
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === 'Enter' ||
                                            event.key === ' '
                                        )
                                            resetClickSuppression();
                                    }}
                                    onClick={() => clickItem(recipe)}
                                >
                                    {selecting && (
                                        <SelectionIndicator
                                            selected={selected}
                                        />
                                    )}
                                    <span
                                        className="meal-list-icon"
                                        aria-hidden="true"
                                    >
                                        <MealIcon />
                                    </span>
                                    <span className="saved-collection-row-info">
                                        <strong>{recipe.recipeName}</strong>
                                        <span>
                                            {recipe.ingredients.length}{' '}
                                            {recipe.ingredients.length === 1
                                                ? 'ingredient'
                                                : 'ingredients'}{' '}
                                            ·{' '}
                                            {Math.round(
                                                totalNutrition(
                                                    recipe.ingredients,
                                                ).calories,
                                            )}{' '}
                                            kcal
                                        </span>
                                    </span>
                                    {!selecting && (
                                        <svg
                                            className="saved-collection-row-chevron"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                        >
                                            <path d="m9 5 7 7-7 7" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="saved-collection-empty">
                    <div
                        className="saved-collection-empty-icon"
                        aria-hidden="true"
                    >
                        <MealIcon />
                    </div>
                    <p className="saved-collection-empty-title">
                        {recipes.length
                            ? 'No matching meals'
                            : 'No saved meals yet'}
                    </p>
                    <p className="saved-collection-empty-hint">
                        {recipes.length
                            ? 'Try a different search.'
                            : 'Create a meal and tap the bookmark to save it here.'}
                    </p>
                </div>
            )}
            {isActive &&
                selecting &&
                createPortal(
                    <BulkDeleteToolbar
                        count={selectedItems.length}
                        noun="meal"
                        deleting={deleting}
                        error={deleteError}
                        onDelete={deleteSelected}
                    />,
                    document.body,
                )}
        </section>
    );
}

function MealIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 11h18c0 5-4 9-9 9s-9-4-9-9ZM6 21h12M8 3c-2 2 2 3 0 5m5-6c-2 2 2 3 0 5m5-4c-2 2 2 3 0 5" />
        </svg>
    );
}
