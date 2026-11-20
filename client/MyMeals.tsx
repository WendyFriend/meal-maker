import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import {
    getRecipes,
    deleteRecipes,
    saveRecipe,
} from './services/recipeService';
import ActionToast from './components/ActionToast';
import { successToastColors } from './components/actionToastColors';
import defaultMealPhoto from './assets/default-meal-photo.jpg';
import LogMealButton from './journal/LogMealButton';
import { useCollectionSelection } from './hooks/useCollectionSelection';
import {
    CollectionTitle,
    SelectionActions,
    SelectionToggle,
} from './components/CollectionSelection';
import SavedCollectionRow from './components/SavedCollectionRow';
import './components/SavedCollection.css';
import './MyMeals.css';
import LoadingSpinner from './components/LoadingSpinner';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import SwipeableCollectionRow from './components/SwipeableCollectionRow';
import CollectionContextMenu from './components/CollectionContextMenu';
import { contextMenuPosition } from './components/contextMenuPosition';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useUndoableDelete } from './hooks/useUndoableDelete';
import {
    hasUnavailableNutrition,
    totalFiber,
    totalNutrition,
} from './utils/nutrition';

const SHOW_NUTRITION_KEY = 'meal-maker:show-recipe-nutrition';
const EMPTY_UPDATED_RECIPES: Record<string, Recipe> = {};
const EMPTY_CREATED_RECIPES: Recipe[] = [];

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
    createdRecipes = EMPTY_CREATED_RECIPES,
    refreshKey = 0,
    onRecipesRefreshed,
}: {
    onOpenRecipe: (recipe: Recipe) => void;
    onEditRecipe?: (recipe: Recipe) => void;
    onCreate?: () => void;
    isActive?: boolean;
    updatedRecipes?: Record<string, Recipe>;
    /** Recipes just created elsewhere, newest first; shown without a reload. */
    createdRecipes?: Recipe[];
    refreshKey?: number;
    onRecipesRefreshed?: () => void;
}) {
    const [loadedRecipes, setRecipes] = useState<Recipe[]>([]);
    const recipes = useMemo(() => {
        const loadedIds = new Set(loadedRecipes.map((recipe) => recipe.id));
        // The list is newest first, so new recipes go on top.
        return [
            ...createdRecipes.filter((recipe) => !loadedIds.has(recipe.id)),
            ...loadedRecipes,
        ].map((recipe) => (recipe.id && updatedRecipes[recipe.id]) || recipe);
    }, [createdRecipes, loadedRecipes, updatedRecipes]);
    const [search, setSearch] = useState('');
    // New recipes (made elsewhere or duplicated here) are briefly highlighted once.
    const newestId = createdRecipes[0]?.id;
    const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const [seenNewestId, setSeenNewestId] = useState(newestId);
    if (newestId !== seenNewestId) {
        setSeenNewestId(newestId);
        if (newestId) {
            setHighlightedIds(new Set([newestId]));
            // A stale search could hide what was just made.
            setSearch('');
        }
    }
    const [showNutrition, setShowNutrition] = useState(
        () => window.localStorage.getItem(SHOW_NUTRITION_KEY) !== 'false',
    );
    const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
    const [recipeMenu, setRecipeMenu] = useState<RecipeMenu | null>(null);
    const [swipeError, setSwipeError] = useState<string>();
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const hasLoadedRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadCount, setReloadCount] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshingRef = useRef(false);
    const { rowRef, exitClass, exitStyle, hiddenIds, remove, undoToast } =
        useUndoableDelete<HTMLDivElement>({
            isActive,
            onHidden: () => setOpenSwipeId(null),
            commit: async (ids) => {
                const names = recipes
                    .filter((recipe) => recipe.id && ids.includes(recipe.id))
                    .map((recipe) => recipe.recipeName);
                try {
                    const deleted = new Set(await deleteRecipes(ids));
                    setRecipes((current) =>
                        current.filter(
                            (recipe) => !recipe.id || !deleted.has(recipe.id),
                        ),
                    );
                    if (ids.some((id) => !deleted.has(id)))
                        throw new Error('Recipe was not removed.');
                } catch {
                    setSwipeError(
                        `Could not delete ${names.join(', ') || 'recipe'}. Please try again.`,
                    );
                }
            },
        });
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
        if (selecting || !isActive) return;
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

    // Rows awaiting an Undoable delete are hidden, so the empty state
    // ignores them too.
    const visibleRecipes = useMemo(
        () =>
            recipes.filter((recipe) => !recipe.id || !hiddenIds.has(recipe.id)),
        [recipes, hiddenIds],
    );
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return visibleRecipes;
        return visibleRecipes.filter(
            (recipe) =>
                recipe.recipeName.toLowerCase().includes(query) ||
                recipe.ingredients.some((ingredient) =>
                    ingredient.name.toLowerCase().includes(query),
                ),
        );
    }, [visibleRecipes, search]);
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

    function deleteMeal(recipe: Recipe) {
        if (!recipe.id) return;
        setRecipeMenu(null);
        setSwipeError(undefined);
        remove([recipe.id], 'Recipe removed.');
    }
    const {
        selecting,
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
        onDelete: (ids) => {
            setRecipeMenu(null);
            setSwipeError(undefined);
            remove(
                ids,
                ids.length === 1
                    ? 'Recipe removed.'
                    : `${ids.length} recipes removed.`,
            );
        },
        search,
        isActive,
        onSelectionStart: () => {
            setSwipeError(undefined);
            setOpenSwipeId(null);
            setRecipeMenu(null);
        },
    });

    // Copies go on top (the list is newest first), highlighted and in view.
    const [duplicating, setDuplicating] = useState(false);
    const [duplicated, setDuplicated] = useState<{
        key: number;
        message: string;
    } | null>(null);
    async function duplicateRecipes(sources: Recipe[]) {
        if (duplicating || !sources.length) return;
        setRecipeMenu(null);
        setSwipeError(undefined);
        setDuplicating(true);
        const taken = new Set(recipes.map((recipe) => recipe.recipeName));
        const inputs = sources.map((recipe) => {
            const recipeName = duplicateName(recipe.recipeName, taken);
            taken.add(recipeName);
            return {
                recipeName,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
            };
        });
        const copies: Recipe[] = [];
        try {
            // Oldest first, so a reload keeps the copies in this order.
            for (const input of [...inputs].reverse())
                copies.unshift(await saveRecipe(input));
        } catch {
            const message =
                sources.length === 1
                    ? `Could not duplicate ${sources[0].recipeName}. Please try again.`
                    : 'Could not duplicate the selected meals. Please try again.';
            setSwipeError(message);
        } finally {
            setDuplicating(false);
        }
        if (!copies.length) return;
        setRecipes((current) => [...copies, ...current]);
        setHighlightedIds(
            new Set(copies.flatMap((recipe) => (recipe.id ? [recipe.id] : []))),
        );
        setSearch('');
        if (copies.length === sources.length) cancelSelection();
        setDuplicated({
            key: Date.now(),
            message:
                copies.length === 1
                    ? 'Recipe duplicated.'
                    : `${copies.length} recipes duplicated.`,
        });
    }

    function refreshMeals() {
        if (refreshingRef.current || isLoading) return;
        setOpenSwipeId(null);
        setRecipeMenu(null);
        refreshingRef.current = true;
        setIsRefreshing(true);
        setReloadCount((count) => count + 1);
    }

    // Like My Ingredients and My Diary, switching back keeps the list as is;
    // pull to refresh reloads it. Bring a new recipe into view.
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isActive || !highlightedIds.size) return;
        listRef.current
            ?.querySelector('.saved-collection-row-new')
            ?.scrollIntoView({ block: 'nearest' });
    }, [isActive, highlightedIds]);

    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive,
        disabled: isLoading || selecting,
        refreshing: isRefreshing,
        onRefresh: refreshMeals,
    });

    return (
        <section
            ref={containerRef}
            className={`my-meals saved-collection${isActive ? ' pull-refresh-active' : ''}`}
            aria-labelledby="my-meals-heading"
            hidden={!isActive}
            inert={!isActive}
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
                    <CollectionTitle
                        id="my-meals-heading"
                        title="My Recipes"
                        selecting={selecting}
                        count={selectedItems.length}
                    />
                    {selecting ? (
                        <SelectionActions
                            count={selectedItems.length}
                            noun="recipe"
                            allVisibleSelected={allVisibleSelected}
                            toggleAllLabel={selectAllLabel}
                            selectableCount={selectableCount}
                            actions={[
                                {
                                    label: 'Duplicate',
                                    icon: <DuplicateIconPaths />,
                                    busy: duplicating,
                                    onClick: () =>
                                        void duplicateRecipes(selectedItems),
                                },
                            ]}
                            onToggleAll={toggleVisible}
                            onDelete={deleteSelected}
                            onCancel={cancelSelection}
                        />
                    ) : (
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
                                        selecting={false}
                                        noun="recipe"
                                        onClick={toggleSelection}
                                    />
                                )}
                        </div>
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
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setOpenSwipeId(null);
                        setRecipeMenu(null);
                    }}
                    placeholder="Search meals..."
                    aria-label="Search meals"
                />
            </div>
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
                <div className="saved-collection-list" ref={listRef}>
                    {filtered.map((recipe, index) => {
                        const selected = isSelected(recipe);
                        return (
                            <SwipeableCollectionRow
                                key={
                                    recipe.id ?? `${recipe.recipeName}-${index}`
                                }
                                name={recipe.recipeName}
                                enabled={Boolean(recipe.id) && !selecting}
                                open={
                                    isActive &&
                                    !selecting &&
                                    openSwipeId === recipe.id
                                }
                                onOpen={() => setOpenSwipeId(recipe.id ?? null)}
                                onClose={() => setOpenSwipeId(null)}
                                onDelete={() => deleteMeal(recipe)}
                            >
                                <SavedCollectionRow
                                    rowRef={
                                        recipe.id
                                            ? rowRef(recipe.id)
                                            : undefined
                                    }
                                    className={`${recipe.id && highlightedIds.has(recipe.id) ? 'saved-collection-row-new' : ''}${exitClass(recipe.id)}`}
                                    style={exitStyle(recipe.id)}
                                    onAnimationEnd={(event) => {
                                        if (
                                            event.animationName ===
                                            'saved-collection-row-new'
                                        )
                                            setHighlightedIds(new Set());
                                    }}
                                    name={recipe.recipeName}
                                    detail={
                                        showNutrition && (
                                            <span className="my-meals-row-nutrition">
                                                {nutritionSummaries?.get(
                                                    recipe,
                                                )}
                                            </span>
                                        )
                                    }
                                    media={
                                        <img
                                            className="meal-ingredient-thumbnail meal-ingredient-thumbnail-photo"
                                            src={defaultMealPhoto}
                                            alt=""
                                            width="40"
                                            height="40"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    }
                                    action={
                                        <LogMealButton
                                            meal={{
                                                mealName: recipe.recipeName,
                                                ingredients: recipe.ingredients,
                                                instructions:
                                                    recipe.instructions,
                                            }}
                                            destinationLabel="My Diary"
                                            feedbackDurationMs={1000}
                                        />
                                    }
                                    selecting={selecting}
                                    selected={selected}
                                    onPressStart={(event) =>
                                        startPress(event, recipe)
                                    }
                                    onPressMove={movePress}
                                    onPressEnd={endPress}
                                    onActivate={() => clickItem(recipe)}
                                    onKeyActivate={resetClickSuppression}
                                    onMenu={(trigger, x, y) =>
                                        openMenu(recipe, trigger, x, y)
                                    }
                                />
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
                        {visibleRecipes.length
                            ? 'No matching meals'
                            : 'No saved meals yet'}
                    </p>
                    <p className="saved-collection-empty-hint">
                        {visibleRecipes.length
                            ? 'Try a different search.'
                            : 'Create and save a meal to see it here.'}
                    </p>
                </div>
            )}
            {isActive &&
                createPortal(
                    !selecting && onCreate ? (
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
                    actions={
                        recipeMenu.recipe.id
                            ? [
                                  {
                                      label: 'Duplicate',
                                      icon: <DuplicateIconPaths />,
                                      onSelect: () =>
                                          void duplicateRecipes([
                                              recipeMenu.recipe,
                                          ]),
                                  },
                              ]
                            : []
                    }
                    onDelete={() => deleteMeal(recipeMenu.recipe)}
                />
            )}
            {duplicated && (
                <ActionToast
                    key={duplicated.key}
                    message={duplicated.message}
                    placement="floating"
                    colors={successToastColors}
                    onClose={() => setDuplicated(null)}
                />
            )}
            {undoToast}
        </section>
    );
}

/** Finder-style copy names: "Curry copy", then "Curry copy 2", … */
function duplicateName(name: string, taken: ReadonlySet<string>) {
    const base = name.replace(/ copy(?: \d+)?$/, '');
    for (let n = 1; ; n += 1) {
        const candidate = `${base} copy${n === 1 ? '' : ` ${n}`}`;
        if (!taken.has(candidate)) return candidate;
    }
}

function DuplicateIconPaths() {
    return (
        <>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
        </>
    );
}

function MealIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 11h18c0 5-4 9-9 9s-9-4-9-9ZM6 21h12M8 3c-2 2 2 3 0 5m5-6c-2 2 2 3 0 5m5-4c-2 2 2 3 0 5" />
        </svg>
    );
}
