import { createPortal } from 'react-dom';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
} from 'react';
import type { Recipe } from '../shared/types/recipe';
import { getRecipes, deleteRecipes } from './services/recipeService';
import defaultMealPhoto from './assets/default-meal-photo.jpg';
import LogMealButton from './journal/LogMealButton';
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
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';

export default function MyMeals({
    onOpenRecipe,
    onCreate,
    isActive = true,
    updatedRecipes = {},
    refreshKey = 0,
    onRecipesRefreshed,
}: {
    onOpenRecipe: (recipe: Recipe) => void;
    onCreate?: () => void;
    isActive?: boolean;
    updatedRecipes?: Record<string, Recipe>;
    refreshKey?: number;
    onRecipesRefreshed?: () => void;
}) {
    const [loadedRecipes, setRecipes] = useState<Recipe[]>([]);
    const recipes = loadedRecipes.map(
        (recipe) => (recipe.id && updatedRecipes[recipe.id]) || recipe,
    );
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const hasLoadedRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadCount, setReloadCount] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshingRef = useRef(false);
    const previousActiveRef = useRef(isActive);
    const [exitingRows, setExitingRows] = useState<Record<string, number>>({});
    const rowElements = useRef(new Map<string, HTMLDivElement>());
    const onRecipesRefreshedRef = useRef(onRecipesRefreshed);
    useLayoutEffect(() => {
        onRecipesRefreshedRef.current = onRecipesRefreshed;
    }, [onRecipesRefreshed]);

    // Keep the loaded list and search while a meal detail or create page is open.
    useEffect(() => {
        let active = true;
        async function loadMeals() {
            try {
                const saved = await getRecipes();
                if (active) {
                    setRecipes(saved);
                    onRecipesRefreshedRef.current?.();
                    hasLoadedRef.current = true;
                    setHasLoaded(true);
                    setError(null);
                }
            } catch {
                if (active)
                    setError(
                        hasLoadedRef.current
                            ? 'Could not refresh your meals. Please try again.'
                            : 'Could not load your meals. Please try again.',
                    );
            } finally {
                if (active) {
                    setIsLoading(false);
                    refreshingRef.current = false;
                    setIsRefreshing(false);
                }
            }
        }
        void loadMeals();
        return () => {
            active = false;
        };
    }, [reloadCount, refreshKey]);

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
        const visibleExits = Object.fromEntries(
            deleted.flatMap((id) => {
                const row = rowElements.current.get(id);
                return row
                    ? [[id, row.getBoundingClientRect().height || 82]]
                    : [];
            }),
        );
        if (
            Object.keys(visibleExits).length &&
            !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
            setExitingRows(visibleExits);
            await new Promise<void>((resolve) =>
                window.setTimeout(resolve, 180),
            );
        }
        setRecipes((current) =>
            current.filter((recipe) => !recipe.id || !removed.has(recipe.id)),
        );
        setExitingRows({});
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

    function refreshMeals() {
        if (refreshingRef.current || isLoading || deleting) return;
        refreshingRef.current = true;
        setIsRefreshing(true);
        setReloadCount((count) => count + 1);
    }

    // Keep a mounted list fresh when returning from another tab or app.
    useEffect(() => {
        if (isActive && !previousActiveRef.current && hasLoadedRef.current) {
            refreshMeals();
        }
        previousActiveRef.current = isActive;
        // The transition itself is the refresh trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

    useEffect(() => {
        if (!isActive) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible' && hasLoadedRef.current)
                refreshMeals();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () =>
            document.removeEventListener('visibilitychange', onVisible);
        // Visibility is the refresh trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, isLoading, deleting]);

    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive,
        disabled: isLoading || deleting || selecting,
        refreshing: isRefreshing,
        onRefresh: refreshMeals,
    });

    return (
        <section
            ref={containerRef}
            className={`my-meals saved-collection${isActive ? ' pull-refresh-active' : ''}${selecting ? ' saved-collection-selecting' : ''}`}
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
            <PullRefreshIndicator
                distance={pullDistance}
                refreshing={isRefreshing}
                label="Refreshing recipes"
            />
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <h1 id="my-meals-heading">My Recipes</h1>
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
            <SelectionControls
                visible={selecting}
                count={selectedItems.length}
                allVisibleSelected={allVisibleSelected}
                label={selectAllLabel}
                disabled={deleting || selectableCount === 0}
                onToggle={toggleVisible}
            />
            {error && hasLoaded && (
                <div
                    className="my-meals-error my-meals-refresh-error"
                    role="alert"
                >
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            setReloadCount((count) => count + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            )}
            {isLoading ? (
                <div
                    className="saved-collection-empty my-meals-loading"
                    role="status"
                >
                    <LoadingSpinner />
                    <p>Loading your meals…</p>
                </div>
            ) : error && !hasLoaded ? (
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
                                ref={(node) => {
                                    if (!recipe.id) return;
                                    if (node)
                                        rowElements.current.set(
                                            recipe.id,
                                            node,
                                        );
                                    else rowElements.current.delete(recipe.id);
                                }}
                                className={`saved-collection-row-wrapper${selected ? ' saved-collection-row-wrapper-selected' : ''}${recipe.id && exitingRows[recipe.id] ? ' my-meals-row-exiting' : ''}`}
                                style={
                                    recipe.id && exitingRows[recipe.id]
                                        ? ({
                                              '--exit-height': `${exitingRows[recipe.id]}px`,
                                          } as CSSProperties)
                                        : undefined
                                }
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
                                    <img
                                        className="my-meals-row-photo"
                                        src={defaultMealPhoto}
                                        alt=""
                                        width="72"
                                        height="72"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <span className="saved-collection-row-info">
                                        <strong>{recipe.recipeName}</strong>
                                    </span>
                                </button>
                                {selecting ? (
                                    <button
                                        type="button"
                                        className="my-meals-row-actions my-meals-selection-action"
                                        aria-label={`Toggle selection for ${recipe.recipeName}`}
                                        aria-pressed={selected}
                                        disabled={deleting}
                                        onClick={() => clickItem(recipe)}
                                    >
                                        <SelectionIndicator
                                            selected={selected}
                                        />
                                    </button>
                                ) : (
                                    <div className="my-meals-row-actions">
                                        <LogMealButton
                                            meal={{
                                                mealName: recipe.recipeName,
                                                ingredients: recipe.ingredients,
                                                instructions:
                                                    recipe.instructions,
                                            }}
                                            destinationLabel="My Plan"
                                            feedbackDurationMs={1000}
                                        />
                                    </div>
                                )}
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
                            : 'Create and save a meal to see it here.'}
                    </p>
                </div>
            )}
            {isActive &&
                createPortal(
                    selecting ? (
                        <BulkDeleteToolbar
                            count={selectedItems.length}
                            noun="meal"
                            deleting={deleting}
                            error={deleteError}
                            onDelete={deleteSelected}
                        />
                    ) : onCreate ? (
                        <button
                            type="button"
                            className="floating-add-button saved-collection-add-button my-meals-add-button"
                            onClick={onCreate}
                            aria-label="Create recipe"
                            title="Create recipe"
                        >
                            <span aria-hidden="true">+</span>
                        </button>
                    ) : null,
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
