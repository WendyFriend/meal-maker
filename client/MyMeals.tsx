import { createPortal } from 'react-dom';
import {
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useMemo,
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
import SwipeableCollectionRow from './components/SwipeableCollectionRow';
import CollectionContextMenu from './components/CollectionContextMenu';
import { contextMenuPosition } from './components/contextMenuPosition';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import {
    hasUnavailableNutrition,
    totalFiber,
    totalNutrition,
} from './utils/nutrition';

const SHOW_NUTRITION_KEY = 'meal-maker:show-recipe-nutrition';
const EMPTY_UPDATED_RECIPES: Record<string, Recipe> = {};

type RecipeMenu = {
    recipe: Recipe;
    trigger: HTMLButtonElement;
    x: number;
    y: number;
};

function recipeNutritionSummary(recipe: Recipe): string {
    if (
        !recipe.ingredients.length ||
        hasUnavailableNutrition(recipe.ingredients)
    )
        return 'Nutrition unavailable';
    const { calories, protein } = totalNutrition(recipe.ingredients);
    if (!Number.isFinite(calories) || !Number.isFinite(protein))
        return 'Nutrition unavailable';
    const fiber = totalFiber(recipe.ingredients);
    return `${Math.round(calories)} kcal · ${Math.round(protein)} g protein · ${fiber.available ? Math.round(fiber.grams) : '—'} g fibre`;
}

export default function MyMeals({
    onOpenRecipe,
    onEditRecipe,
    onCreate,
    isActive = true,
    updatedRecipes = EMPTY_UPDATED_RECIPES,
    refreshKey = 0,
    onRecipesRefreshed,
}: {
    onOpenRecipe: (recipe: Recipe) => void;
    onEditRecipe?: (recipe: Recipe) => void;
    onCreate?: () => void;
    isActive?: boolean;
    updatedRecipes?: Record<string, Recipe>;
    refreshKey?: number;
    onRecipesRefreshed?: () => void;
}) {
    const [loadedRecipes, setRecipes] = useState<Recipe[]>([]);
    const recipes = useMemo(
        () =>
            loadedRecipes.map(
                (recipe) => (recipe.id && updatedRecipes[recipe.id]) || recipe,
            ),
        [loadedRecipes, updatedRecipes],
    );
    const [search, setSearch] = useState('');
    const [showNutrition, setShowNutrition] = useState(
        () => window.localStorage.getItem(SHOW_NUTRITION_KEY) !== 'false',
    );
    const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
    const [recipeMenu, setRecipeMenu] = useState<RecipeMenu | null>(null);
    const lastPointerType = useRef<string | null>(null);
    const [swipeError, setSwipeError] = useState<string>();
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
    useEffect(() => {
        window.localStorage.setItem(SHOW_NUTRITION_KEY, String(showNutrition));
    }, [showNutrition]);

    function openMenu(
        recipe: Recipe,
        trigger: HTMLButtonElement,
        x: number,
        y: number,
    ) {
        if (selecting || deleting || !isActive) return;
        setOpenSwipeId(null);
        setRecipeMenu({ recipe, trigger, ...contextMenuPosition(x, y) });
    }

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

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return recipes;
        return recipes.filter(
            (recipe) =>
                recipe.recipeName.toLowerCase().includes(query) ||
                recipe.ingredients.some((ingredient) =>
                    ingredient.name.toLowerCase().includes(query),
                ),
        );
    }, [recipes, search]);
    const nutritionSummaries = useMemo(
        () =>
            showNutrition
                ? new Map(
                      filtered.map((recipe) => [
                          recipe,
                          recipeNutritionSummary(recipe),
                      ]),
                  )
                : null,
        [filtered, showNutrition],
    );

    async function deleteMeals(ids: string[]) {
        setRecipeMenu(null);
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
    async function deleteMeal(recipe: Recipe) {
        if (!recipe.id) return false;
        setSwipeError(undefined);
        try {
            const deleted = await deleteMeals([recipe.id]);
            if (!deleted.includes(recipe.id))
                throw new Error('Meal was not removed.');
            setOpenSwipeId(null);
            return true;
        } catch {
            setSwipeError(
                `Could not delete ${recipe.recipeName}. Please try again.`,
            );
            return false;
        }
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
        onOpen: (recipe) => {
            setOpenSwipeId(null);
            setRecipeMenu(null);
            onOpenRecipe(recipe);
        },
        onDeleteMany: deleteMeals,
        noun: 'meal',
        search,
        isActive,
        onSelectionStart: () => {
            setOpenSwipeId(null);
            setRecipeMenu(null);
        },
    });

    function refreshMeals() {
        if (refreshingRef.current || isLoading || deleting) return;
        setOpenSwipeId(null);
        setRecipeMenu(null);
        refreshingRef.current = true;
        setIsRefreshing(true);
        setReloadCount((count) => count + 1);
    }
    const refreshMealsFromEffect = useEffectEvent(refreshMeals);

    // Keep a mounted list fresh when returning from another tab or app.
    useEffect(() => {
        if (isActive && !previousActiveRef.current && hasLoadedRef.current) {
            refreshMealsFromEffect();
        }
        previousActiveRef.current = isActive;
    }, [isActive]);

    useEffect(() => {
        if (!isActive) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible' && hasLoadedRef.current)
                refreshMealsFromEffect();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () =>
            document.removeEventListener('visibilitychange', onVisible);
    }, [isActive]);

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
                    <div className="my-meals-title-actions">
                        <button
                            type="button"
                            className="my-meals-nutrition-toggle"
                            aria-label="Show nutrition"
                            aria-pressed={showNutrition}
                            title={
                                showNutrition
                                    ? 'Hide nutrition'
                                    : 'Show nutrition'
                            }
                            onClick={() =>
                                setShowNutrition((current) => !current)
                            }
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                                className={
                                    showNutrition
                                        ? 'my-meals-eye-open'
                                        : 'my-meals-eye-closed'
                                }
                            >
                                {showNutrition ? (
                                    <>
                                        <path d="M2.5 12C5.3 8.5 8.4 6.8 12 6.8s6.7 1.7 9.5 5.2c-2.8 3.5-5.9 5.2-9.5 5.2S5.3 15.5 2.5 12Z" />
                                        <circle cx="12" cy="12" r="4.9" />
                                        <circle
                                            cx="12"
                                            cy="12"
                                            r="1.7"
                                            fill="currentColor"
                                            stroke="none"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <path
                                            d="M3.2 8.7C7.6 15.9 16.4 15.9 20.8 8.7"
                                            strokeWidth="2.2"
                                        />
                                        <path
                                            d="m6 12.2-1.7 2.6m4.4-.2-.9 3.1m4.2-2.2v3.4m3.3-4.3.9 3.1m2-5.5 1.7 2.6"
                                            strokeWidth="2.2"
                                        />
                                    </>
                                )}
                            </svg>
                        </button>
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
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setOpenSwipeId(null);
                        setRecipeMenu(null);
                    }}
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
            {swipeError && (
                <p className="saved-collection-swipe-error" role="alert">
                    {swipeError}
                </p>
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
                            <SwipeableCollectionRow
                                key={
                                    recipe.id ?? `${recipe.recipeName}-${index}`
                                }
                                name={recipe.recipeName}
                                enabled={
                                    Boolean(recipe.id) &&
                                    !selecting &&
                                    !deleting
                                }
                                open={
                                    isActive &&
                                    !selecting &&
                                    openSwipeId === recipe.id
                                }
                                onOpen={() => setOpenSwipeId(recipe.id ?? null)}
                                onClose={() => setOpenSwipeId(null)}
                                onDelete={() => deleteMeal(recipe)}
                            >
                                <div
                                    ref={(node) => {
                                        if (!recipe.id) return;
                                        if (node)
                                            rowElements.current.set(
                                                recipe.id,
                                                node,
                                            );
                                        else
                                            rowElements.current.delete(
                                                recipe.id,
                                            );
                                    }}
                                    className={`saved-collection-row-wrapper${selected ? ' saved-collection-row-wrapper-selected' : ''}${recipe.id && exitingRows[recipe.id] ? ' my-meals-row-exiting' : ''}`}
                                    onPointerDownCapture={(event) => {
                                        lastPointerType.current =
                                            event.pointerType;
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        if (lastPointerType.current === 'touch')
                                            return;
                                        const trigger =
                                            event.currentTarget.querySelector<HTMLButtonElement>(
                                                '.saved-collection-row',
                                            );
                                        if (trigger)
                                            openMenu(
                                                recipe,
                                                trigger,
                                                event.clientX,
                                                event.clientY,
                                            );
                                    }}
                                    style={
                                        recipe.id && exitingRows[recipe.id]
                                            ? ({
                                                  '--exit-height': `${exitingRows[recipe.id]}px`,
                                              } as CSSProperties)
                                            : undefined
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
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'ContextMenu' ||
                                                (event.shiftKey &&
                                                    event.key === 'F10')
                                            ) {
                                                event.preventDefault();
                                                const rect =
                                                    event.currentTarget.getBoundingClientRect();
                                                openMenu(
                                                    recipe,
                                                    event.currentTarget,
                                                    rect.left + 20,
                                                    rect.bottom - 8,
                                                );
                                                return;
                                            }
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
                                            {showNutrition && (
                                                <span className="my-meals-row-nutrition">
                                                    {nutritionSummaries?.get(
                                                        recipe,
                                                    )}
                                                </span>
                                            )}
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
                                                    ingredients:
                                                        recipe.ingredients,
                                                    instructions:
                                                        recipe.instructions,
                                                }}
                                                destinationLabel="My Plan"
                                                feedbackDurationMs={1000}
                                            />
                                        </div>
                                    )}
                                </div>
                            </SwipeableCollectionRow>
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
            {isActive && recipeMenu && !selecting && (
                <CollectionContextMenu
                    name={recipeMenu.recipe.recipeName}
                    x={recipeMenu.x}
                    y={recipeMenu.y}
                    trigger={recipeMenu.trigger}
                    canDelete={Boolean(recipeMenu.recipe.id)}
                    onClose={() => setRecipeMenu(null)}
                    onEdit={() => {
                        if (onEditRecipe) onEditRecipe(recipeMenu.recipe);
                        else onOpenRecipe(recipeMenu.recipe);
                    }}
                    onDelete={() => void deleteMeal(recipeMenu.recipe)}
                />
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
