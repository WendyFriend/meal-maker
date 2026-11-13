import PageHeader from './navigation/PageHeader';
import NavigationPanel from './navigation/NavigationPanel';
import BottomNavigation from './navigation/BottomNavigation';
import {
    mainPageFromPath,
    mainPagePaths,
    pageConfig,
    subPageParent,
    type MainPage,
    type Page,
} from './navigation/pages';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import './App.css';
import type { AppError, ErrorResponse } from './meal-generator/types';
import {
    type GenerateMealRequest,
    type GenerateMealResponse,
    type IngredientInfo,
    type MealGenerator,
    type MealPreference,
    type UserIngredient,
} from '../shared/types/types';
import MyIngredients from './MyIngredients';
import IngredientDetail from './IngredientDetail';
import MyMeals from './MyMeals';
import type { DetailEditorHandle } from './components/DetailEditorHandle';
import MyJournal from './MyJournal';
import Settings from './Settings';
import { loadMealGenerator, saveMealGenerator } from './settings/mealGenerator';
import RecipeDetail from './RecipeDetail';
import CreateRecipe from './CreateRecipe';
import { saveRecipe, updateRecipe } from './services/recipeService';
import MealMakerForm from './meal-generator/components/MealMakerForm';
import { MealMakerIntro } from './meal-generator/components/MealMakerIntro';
import './meal-generator/MealMaker.css';
import MealResult from './meal-generator/components/MealResult';
import { useAuth } from './auth/useAuth';
import AuthLoading from './auth/AuthLoading';
import AccountRequiredDialog from './auth/AccountRequiredDialog';
import {
    useGuestAccess,
    type AccountRequiredAction,
} from './auth/useGuestAccess';
import {
    getUserIngredients,
    saveUserIngredient as saveUserIngredientToDB,
    updateUserIngredient as updateUserIngredientInDB,
    deleteUserIngredients as deleteUserIngredientsInDB,
} from './services/ingredientService';
import type { Recipe } from '../shared/types/recipe';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import AddIngredient from './AddIngredient';
import {
    isUserIngredient,
    mergeIngredientNutrition,
    needsMacroNutrition,
    normalizeIngredientName,
} from './utils/Ingredient';
import { getIngredientNutrition } from './services/micronutrientService';
import LoadingSpinner from './components/LoadingSpinner';
import cookingLoader from './assets/animations/cooking-loader.svg';
import { IngredientCollectionContext } from './ingredients/IngredientCollectionContext';
import Brand from './components/Brand';
import { findCommonQuickAddIngredient } from './meal-generator/components/commonQuickAddIngredients';

function findIngredientByName<T extends IngredientInfo>(
    ingredients: T[],
    name: string,
): T | undefined {
    const normalizedName = normalizeIngredientName(name);
    return ingredients.find(
        (ingredient) =>
            normalizeIngredientName(ingredient.name) === normalizedName,
    );
}

function initialPage(): Page {
    return mainPageFromPath(window.location.pathname) ?? 'meal-maker';
}

function App() {
    const { user, loading, signOut } = useAuth();
    const guestAccess = useGuestAccess({
        authenticated: Boolean(user),
        authLoading: loading,
    });
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const lastMenuTriggerRef = useRef<HTMLButtonElement>(null);

    const [currentPage, setCurrentPage] = useState<Page>(initialPage);
    const [pageDirection, setPageDirection] = useState<
        'none' | 'right' | 'left'
    >('none');

    const [ingredients, setIngredients] = useState<string[]>(
        guestAccess.initialDraft.ingredients,
    );
    const [selectedIngredientIndex, setSelectedIngredientIndex] = useState<
        number | null
    >(null);

    const [userIngredients, setUserIngredients] = useState<UserIngredient[]>(
        [],
    );
    const [ingredientsRefreshing, setIngredientsRefreshing] = useState(false);
    const [ingredientsRefreshError, setIngredientsRefreshError] = useState('');
    const ingredientsRefreshPending = useRef(false);
    const ingredientsRequestId = useRef(0);
    const [selectedSavedIngredientId, setSelectedSavedIngredientId] =
        useState<string>();
    const [addIngredientDraft, setAddIngredientDraft] =
        useState<IngredientInfo>();
    const [addIngredientReferencePhoto, setAddIngredientReferencePhoto] =
        useState<string>();
    const [ingredientEditor, setIngredientEditor] = useState({
        editing: false,
        saving: false,
    });
    const isEditingIngredient =
        currentPage === 'add-ingredient' ||
        (currentPage === 'ingredient-detail' && ingredientEditor.editing);
    const [updatedRecipes, setUpdatedRecipes] = useState<
        Record<string, Recipe>
    >({});
    const [recipesRefreshKey, setRecipesRefreshKey] = useState(0);
    const [hasVisitedRecipes, setHasVisitedRecipes] = useState(
        currentPage === 'my-recipes',
    );
    const [hasVisitedPlan, setHasVisitedPlan] = useState(
        currentPage === 'my-journal',
    );

    useEffect(() => {
        const page = mainPageFromPath(window.location.pathname) ?? 'meal-maker';
        window.history.replaceState({ page }, '', mainPagePaths[page]);
    }, []);
    const ingredientDetailRef = useRef<DetailEditorHandle>(null);
    const pendingIngredientEdit = useRef(false);
    const ingredientListScroll = useRef(0);
    const previousPage = useRef<Page>(currentPage);
    // Nutrition edits kept for this meal when "Save to Ingredients" is unchecked.
    const [thisMealIngredients, setThisMealIngredients] = useState<
        IngredientInfo[]
    >(guestAccess.initialDraft.ingredientNutrition);

    const [caloriesGoal, setCaloriesGoal] = useState<number | undefined>(
        guestAccess.initialDraft.caloriesGoal,
    );
    const [proteinGramsGoal, setProteinGramsGoal] = useState<
        number | undefined
    >(guestAccess.initialDraft.proteinGramsGoal);
    const [mealPreferences, setMealPreferences] = useState<MealPreference[]>(
        guestAccess.initialDraft.mealPreferences ?? [],
    );
    const [mealGenerator, setMealGenerator] =
        useState<MealGenerator>(loadMealGenerator);

    const [meal, setMeal] = useState<GenerateMealResponse | undefined>(
        guestAccess.initialDraft.meal,
    );
    const [originalMeal, setOriginalMeal] = useState<
        GenerateMealResponse | undefined
    >(guestAccess.initialDraft.originalMeal);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<AppError>();

    // Recipe opened from the My Meals list; shown on the detail page.
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | undefined>();
    const [editRecipeOnOpen, setEditRecipeOnOpen] = useState(false);

    // Scroll target for the generated recipe; scrolls smoothly once the
    // result has mounted (see the layout effect below).
    const mealResultRef = useRef<HTMLDivElement>(null);
    const pendingMealResultScroll = useRef(false);
    const generatingRef = useRef<HTMLDivElement>(null);
    const mealFormRef = useRef<HTMLDivElement>(null);
    const pendingMealForm = useRef(false);

    useEffect(() => {
        if (!isGenerating) return;
        const frame = window.requestAnimationFrame(() => {
            const target = generatingRef.current;
            if (!target) return;
            target.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                    .matches
                    ? 'auto'
                    : 'smooth',
                block: 'end',
            });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [isGenerating]);

    useLayoutEffect(() => {
        if (
            isGenerating ||
            !meal ||
            !originalMeal ||
            !pendingMealResultScroll.current
        )
            return;

        const target = mealResultRef.current;
        if (!target) return;

        pendingMealResultScroll.current = false;
        target.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
            block: 'start',
        });
    }, [isGenerating, meal, originalMeal]);

    const scrollToMealForm = useCallback(() => {
        const target = mealFormRef.current?.parentElement;
        mealFormRef.current?.focus({ preventScroll: true });
        target?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
            block: 'start',
        });
    }, []);
    useLayoutEffect(() => {
        if (currentPage === 'meal-maker' && pendingMealForm.current) {
            scrollToMealForm();
            pendingMealForm.current = false;
        }
    }, [currentPage, scrollToMealForm]);
    function closeNavigation() {
        lastMenuTriggerRef.current?.focus({ preventScroll: true });
        setIsSidebarOpen(false);
    }
    function navigateToMeal() {
        if (currentPage === 'meal-maker') scrollToMealForm();
        else {
            pendingMealForm.current = true;
            navigateToPage('meal-maker');
        }
    }

    const isMealMaker = currentPage === 'meal-maker';
    const isIngredientsPage =
        currentPage === 'my-ingredients' ||
        subPageParent[currentPage] === 'my-ingredients';
    const usesIngredientsTheme =
        currentPage === 'my-ingredients' ||
        currentPage === 'ingredient-detail' ||
        currentPage === 'add-ingredient';
    const usesCollectionTheme =
        usesIngredientsTheme ||
        currentPage === 'my-recipes' ||
        currentPage === 'my-journal' ||
        currentPage === 'settings';
    const selectedSavedIngredient = userIngredients.find(
        ({ ingredientId }) => ingredientId === selectedSavedIngredientId,
    );
    const isRecipesPage =
        currentPage === 'my-recipes' ||
        subPageParent[currentPage] === 'my-recipes';

    useLayoutEffect(() => {
        const scroller =
            document.querySelector<HTMLElement>('.page-transition');
        if (
            scroller &&
            (currentPage === 'ingredient-detail' ||
                currentPage === 'add-ingredient')
        ) {
            scroller.scrollTop = 0;
            scroller
                .querySelector<HTMLElement>('.ingredient-detail')
                ?.focus({ preventScroll: true });
        } else if (
            scroller &&
            currentPage === 'my-ingredients' &&
            (previousPage.current === 'ingredient-detail' ||
                previousPage.current === 'add-ingredient')
        ) {
            scroller.scrollTop = ingredientListScroll.current;
            const trigger =
                previousPage.current === 'ingredient-detail'
                    ? document.getElementById(
                          `saved-ingredient-${selectedSavedIngredientId}`,
                      )
                    : document.querySelector<HTMLElement>(
                          '.ingredients-add-button',
                      );
            trigger?.focus({ preventScroll: true });
        }
        previousPage.current = currentPage;
    }, [currentPage, selectedSavedIngredientId]);

    useLayoutEffect(() => {
        if (
            currentPage !== 'ingredient-detail' ||
            !pendingIngredientEdit.current
        )
            return;
        if (!ingredientDetailRef.current) return;
        pendingIngredientEdit.current = false;
        ingredientDetailRef.current.edit();
    }, [currentPage, selectedSavedIngredientId]);

    const userId = user?.id;
    const refreshUserIngredients = useCallback(async () => {
        if (!userId || ingredientsRefreshPending.current) return;
        ingredientsRefreshPending.current = true;
        const requestId = ++ingredientsRequestId.current;
        setIngredientsRefreshing(true);
        setIngredientsRefreshError('');
        try {
            const saved = await getUserIngredients();
            if (requestId === ingredientsRequestId.current)
                setUserIngredients(saved);
        } catch {
            if (requestId === ingredientsRequestId.current)
                setIngredientsRefreshError(
                    'Could not refresh your ingredients.',
                );
        } finally {
            ingredientsRefreshPending.current = false;
            setIngredientsRefreshing(false);
        }
    }, [userId]);
    useEffect(() => {
        if (!userId) return;
        const requestId = ++ingredientsRequestId.current;
        let active = true;

        async function loadIngredients() {
            try {
                const ingredients = await getUserIngredients();
                if (active && requestId === ingredientsRequestId.current)
                    setUserIngredients(ingredients);
            } catch (error) {
                if (active) console.error(error);
            }
        }

        void loadIngredients();
        return () => {
            active = false;
        };
    }, [userId]);

    // Restore the page represented by the URL or a still-mounted detail entry.
    useEffect(() => {
        function handlePopState() {
            const mainPage =
                mainPageFromPath(window.location.pathname) ?? 'meal-maker';
            const detailPage = window.history.state?.page as Page | undefined;
            const canRestoreDetail =
                detailPage &&
                subPageParent[detailPage] === mainPage &&
                (detailPage !== 'recipe-detail' || selectedRecipe) &&
                (detailPage !== 'ingredient-detail' ||
                    selectedSavedIngredientId);
            const nextPage = canRestoreDetail ? detailPage : mainPage;
            setPageDirection(
                subPageParent[currentPage] === nextPage ? 'right' : 'none',
            );
            setIngredientEditor({ editing: false, saving: false });
            if (nextPage === 'my-recipes') setHasVisitedRecipes(true);
            if (nextPage === 'my-journal') setHasVisitedPlan(true);
            setCurrentPage(nextPage);
        }

        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [currentPage, selectedRecipe, selectedSavedIngredientId]);

    function navigateToPage(page: Page) {
        const isReturning = subPageParent[currentPage] === page;
        const isAdvancing = subPageParent[page] === currentPage;

        if (isAdvancing) {
            if (window.history.state?.page === page) {
                // A history entry for this sub-page is already current (e.g.
                // after a forward gesture) — reuse it instead of stacking
                // another one.
                window.history.replaceState({ page }, '');
            } else {
                window.history.pushState({ page }, '');
            }
        } else if (isReturning) {
            // The in-app back button consumes the entry pushed on the way
            // in; the popstate listener above performs the navigation.
            window.history.back();
            return;
        } else if (pageConfig[page].type === 'main') {
            const path = mainPagePaths[page as MainPage];
            if (window.location.pathname !== path || currentPage !== page)
                window.history.pushState({ page }, '', path);
        }

        setPageDirection(isAdvancing ? 'left' : 'none');

        setIngredientEditor({ editing: false, saving: false });
        if (page === 'my-recipes') setHasVisitedRecipes(true);
        if (page === 'my-journal') setHasVisitedPlan(true);
        setCurrentPage(page);
    }

    function openSavedIngredient(ingredient: UserIngredient, edit = false) {
        ingredientListScroll.current =
            document.querySelector('.page-transition')?.scrollTop ?? 0;
        pendingIngredientEdit.current = edit;
        setIngredientEditor({ editing: false, saving: false });
        setSelectedSavedIngredientId(ingredient.ingredientId);
        navigateToPage('ingredient-detail');
    }

    const getIngredientInfoFromStoredData = useCallback(
        (ingredientName: string): IngredientInfo | UserIngredient =>
            findIngredientByName(thisMealIngredients, ingredientName) ??
            findIngredientByName(userIngredients, ingredientName) ?? {
                ...findCommonQuickAddIngredient(ingredientName),
                name: ingredientName,
            },
        [thisMealIngredients, userIngredients],
    );

    async function updateUserIngredient(
        ingredientId: string,
        updatedIngredient: UserIngredient,
    ) {
        // update database user ingredients
        const updated = await updateUserIngredientInDB(
            ingredientId,
            updatedIngredient,
        );

        // update local copy of user ingredients
        setUserIngredients((userIngredients) =>
            userIngredients.map((userIngredient) =>
                userIngredient.ingredientId === updated.ingredientId
                    ? updated
                    : userIngredient,
            ),
        );
    }

    async function saveMealChanges(recipe: Recipe) {
        if (!recipe.id) throw new Error('This meal has not been saved yet.');
        const id = recipe.id;
        const saved = await updateRecipe(id, recipe);
        setSelectedRecipe(saved);
        setUpdatedRecipes((current) => ({ ...current, [id]: saved }));
        return saved;
    }

    async function createRecipe(recipe: Parameters<typeof saveRecipe>[0]) {
        await saveRecipe(recipe);
        setRecipesRefreshKey((current) => current + 1);
        navigateToPage('my-recipes');
    }

    async function createUserIngredient(ingredient: IngredientInfo) {
        // update database user ingredients
        const created = await saveUserIngredientToDB(ingredient);
        // update local copy of user ingredients
        setUserIngredients((userIngredients) => [...userIngredients, created]);
        return created;
    }

    async function deleteUserIngredients(ids: string[]) {
        const deleted = await deleteUserIngredientsInDB(ids);
        const deletedIds = new Set(deleted);
        setUserIngredients((userIngredients) =>
            userIngredients.filter(
                ({ ingredientId }) => !deletedIds.has(ingredientId),
            ),
        );
        return deleted;
    }

    async function saveSheetIngredient(ingredient: IngredientInfo) {
        const existing = isUserIngredient(ingredient)
            ? userIngredients.find(
                  ({ ingredientId }) =>
                      ingredientId === ingredient.ingredientId,
              )
            : findIngredientByName(userIngredients, ingredient.name);
        if (existing) {
            await updateUserIngredient(existing.ingredientId, {
                ...existing,
                ...ingredient,
                ingredientId: existing.ingredientId,
            });
        } else {
            await createUserIngredient(ingredient);
        }
    }

    async function handleIngredientSave(
        savedIngredient: UserIngredient | IngredientInfo,
        saveToUserIngredients: boolean,
    ) {
        if (selectedIngredientIndex === null) return;

        try {
            // Edits to a saved ingredient also update My Ingredients.
            if (saveToUserIngredients && user) {
                if (isUserIngredient(savedIngredient)) {
                    await updateUserIngredient(
                        savedIngredient.ingredientId,
                        savedIngredient,
                    );
                } else {
                    await createUserIngredient(savedIngredient);
                }
            }
            // Preserve edited values in this meal even when a local override
            // existed before the ingredient was saved or removed.
            setThisMealIngredients((current) => {
                const originalName = ingredients[selectedIngredientIndex];
                const matches = (ingredient: IngredientInfo) =>
                    normalizeIngredientName(ingredient.name) ===
                        normalizeIngredientName(originalName) ||
                    normalizeIngredientName(ingredient.name) ===
                        normalizeIngredientName(savedIngredient.name);
                return current.some(matches)
                    ? current.map((ingredient) =>
                          matches(ingredient) ? savedIngredient : ingredient,
                      )
                    : [...current, savedIngredient];
            });

            // Always update the current meal ingredient
            setIngredients((ingredientNames) =>
                ingredientNames.map((ingredientName, index) =>
                    index === selectedIngredientIndex
                        ? savedIngredient.name
                        : ingredientName,
                ),
            );
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    function removeIngredient(ingredientName: string) {
        setIngredients((ingredients) =>
            ingredients.filter((ingredient) => ingredient !== ingredientName),
        );
        setThisMealIngredients((ingredients) =>
            ingredients.filter(
                (ingredient) => ingredient.name !== ingredientName,
            ),
        );
    }

    function cacheMealIngredientNutritionByName(
        name: string,
        nutrition: IngredientInfo,
    ) {
        const enriched = { ...nutrition, name };
        const key = normalizeIngredientName(name);
        setThisMealIngredients((current) =>
            current.some(
                (ingredient) =>
                    normalizeIngredientName(ingredient.name) === key,
            )
                ? current.map((ingredient) =>
                      normalizeIngredientName(ingredient.name) === key
                          ? enriched
                          : ingredient,
                  )
                : [...current, enriched],
        );
    }

    function cacheMealIngredientNutrition(
        index: number,
        nutrition: IngredientInfo,
    ) {
        const name = ingredients[index];
        if (name) cacheMealIngredientNutritionByName(name, nutrition);
    }

    useEffect(() => {
        let active = true;

        ingredients.forEach((name) => {
            const ingredient = getIngredientInfoFromStoredData(name);
            if (!needsMacroNutrition(ingredient)) return;

            void getIngredientNutrition(name)
                .then((nutrition) => {
                    if (!active) return;
                    cacheMealIngredientNutritionByName(
                        name,
                        mergeIngredientNutrition(ingredient, nutrition),
                    );
                })
                .catch((error) => {
                    if (active)
                        console.error(
                            'Ingredient nutrition prefetch failed:',
                            error,
                        );
                });
        });

        return () => {
            active = false;
        };
    }, [ingredients, mealGenerator, getIngredientInfoFromStoredData]);

    async function openMealIngredient(index: number) {
        const ingredient = getIngredientInfoFromStoredData(ingredients[index]);
        if (needsMacroNutrition(ingredient)) {
            try {
                cacheMealIngredientNutrition(
                    index,
                    mergeIngredientNutrition(
                        ingredient,
                        await getIngredientNutrition(ingredient.name),
                    ),
                );
            } catch (error) {
                console.error('Ingredient nutrition lookup failed:', error);
            }
        }
        setSelectedIngredientIndex(index);
    }

    async function handleCreate() {
        setIsGenerating(true);
        setMeal(undefined);
        setOriginalMeal(undefined);
        setError(undefined);
        try {
            const input: GenerateMealRequest = {
                ingredients: ingredients.map(getIngredientInfoFromStoredData),
                requirements: {
                    calories: caloriesGoal,
                    proteinGrams: proteinGramsGoal,
                    preferences: mealPreferences,
                },
            };

            const body = JSON.stringify(input);
            const started = performance.now();
            const response = await fetch('/api/generate-meal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Meal-Generator': mealGenerator,
                },
                body,
            });

            const payload = await response.json();
            const requestMs = Math.round(performance.now() - started);
            const serverTiming = response.headers?.get('Server-Timing');
            function duration(metric: string): number | null {
                const value = serverTiming
                    ?.split(',')
                    .find((entry) => entry.trim().startsWith(`${metric};`))
                    ?.match(/;\s*dur=(\d+(?:\.\d+)?)/)?.[1];
                return value === undefined ? null : Number(value);
            }

            console.info('Meal generation timing', {
                generator: mealGenerator,
                ingredientCount: input.ingredients.length,
                status: response.status,
                requestMs,
                serverMs: duration(
                    mealGenerator === 'nutrition-lab'
                        ? 'nutrition_lab'
                        : 'generation',
                ),
                ...(mealGenerator === 'ollama'
                    ? {
                          usdaMs: duration('usda'),
                          ollamaMs: duration('ollama'),
                      }
                    : {}),
            });

            if (response.status === 422) {
                setError((payload as ErrorResponse).error);
                return;
            }
            if (!response.ok) throw new Error('Failed to generate meal');

            const mealResponse = payload as GenerateMealResponse;

            if (!Array.isArray(mealResponse.ingredients)) {
                console.error('Unexpected generate-meal response:', payload);
                throw new Error('Invalid meal response');
            }

            pendingMealResultScroll.current = true;
            setMeal(mealResponse);
            setOriginalMeal(mealResponse);
        } catch (error) {
            console.error(error);
            setError({
                code: 'UNKNOWN_ERROR',
                message:
                    'Something went wrong while generating your meal. Please try again.',
            });
        } finally {
            setIsGenerating(false);
        }
    }

    async function handleSignOut() {
        setIsSidebarOpen(false);
        const scroller = document.querySelector<HTMLElement>(
            '.page-transition-meal-maker',
        );
        if (scroller) scroller.scrollTop = 0;
        window.history.replaceState({ page: 'meal-maker' }, '', '/');
        setCurrentPage('meal-maker');
        setPageDirection('none');
        setUserIngredients([]);
        setIngredients([]);
        setThisMealIngredients([]);
        setSelectedIngredientIndex(null);
        setCaloriesGoal(undefined);
        setProteinGramsGoal(undefined);
        setMealPreferences([]);
        setMeal(undefined);
        setOriginalMeal(undefined);
        setError(undefined);
        guestAccess.reset();
        await signOut();
        guestAccess.showLanding();
    }

    function findExistingIngredient(name: string): string | undefined {
        return findIngredientByName(userIngredients, name)?.name;
    }

    function requestGuestAccount(action: AccountRequiredAction): boolean {
        if (user) return false;
        guestAccess.requestAccount(action, {
            ingredients,
            ingredientNutrition: thisMealIngredients,
            caloriesGoal,
            proteinGramsGoal,
            mealPreferences,
            meal,
            originalMeal,
        });
        return true;
    }

    function renderMealMakerWorkspace() {
        return (
            <div className="meal-maker-screen">
                <section className="meal-maker-tool" aria-label="Meal maker">
                    <MealMakerForm
                        ref={mealFormRef}
                        ingredients={ingredients}
                        savedIngredients={userIngredients}
                        onIngredientsChange={setIngredients}
                        onIngredientNutritionSelected={
                            cacheMealIngredientNutritionByName
                        }
                        onRemoveIngredient={removeIngredient}
                        onIngredientClick={openMealIngredient}
                        calories={caloriesGoal}
                        onCaloriesChange={setCaloriesGoal}
                        proteinGrams={proteinGramsGoal}
                        onProteinGramsChange={setProteinGramsGoal}
                        preferences={mealPreferences}
                        onPreferencesChange={setMealPreferences}
                        generating={isGenerating}
                        onCreate={handleCreate}
                    />
                </section>

                {selectedIngredientIndex !== null && (
                    <NutritionDialog
                        ingredientInfo={getIngredientInfoFromStoredData(
                            ingredients[selectedIngredientIndex],
                        )}
                        onClose={() => setSelectedIngredientIndex(null)}
                        onSave={handleIngredientSave}
                        onNutritionResolved={(nutrition) =>
                            cacheMealIngredientNutrition(
                                selectedIngredientIndex,
                                nutrition,
                            )
                        }
                    />
                )}

                {isGenerating && (
                    <div
                        ref={generatingRef}
                        className="generating-indicator"
                        role="status"
                        aria-live="polite"
                    >
                        <img
                            className="meal-cooking-loader"
                            src={cookingLoader}
                            width={160}
                            height={160}
                            alt=""
                        />
                        <span
                            className="meal-cooking-loader-static"
                            aria-hidden="true"
                        >
                            <LoadingSpinner size="large" />
                        </span>
                        <p className="generating-message">
                            Creating your meal…
                        </p>
                    </div>
                )}

                {error?.code === 'UNKNOWN_ERROR' && (
                    <div className="error-message" role="alert">
                        {error.message}
                    </div>
                )}

                {!isGenerating && meal && originalMeal && (
                    <div ref={mealResultRef} className="meal-maker-result">
                        <MealResult
                            meal={meal}
                            originalMeal={originalMeal}
                            onChange={setMeal}
                            onAuthRequired={requestGuestAccount}
                            onSavedRecipesChange={() =>
                                setRecipesRefreshKey((current) => current + 1)
                            }
                        />
                    </div>
                )}
            </div>
        );
    }

    if (loading) {
        return <AuthLoading />;
    }

    if (!user) {
        return (
            <div className="app app-public">
                <header className="page-header page-header-meal-maker">
                    <div className="page-header-inner">
                        <Brand className="page-header-brand" />
                    </div>
                </header>
                <div className="page-transition page-transition-meal-maker">
                    <main className="page-content page-content-meal-maker">
                        <div className="meal-maker-screen">
                            <MealMakerIntro
                                onTryMealMaker={() =>
                                    guestAccess.enterMealMaker(scrollToMealForm)
                                }
                                onSignIn={() => requestGuestAccount('sign-in')}
                                onSignUp={() => requestGuestAccount('sign-up')}
                            />
                        </div>
                        {renderMealMakerWorkspace()}
                    </main>
                </div>
                {guestAccess.accountAction && (
                    <AccountRequiredDialog
                        action={guestAccess.accountAction}
                        onClose={guestAccess.closeAccountPrompt}
                    />
                )}
            </div>
        );
    }

    return (
        <IngredientCollectionContext
            value={{
                ingredients: userIngredients,
                save: saveSheetIngredient,
            }}
        >
            <div className="app">
                <PageHeader
                    currentPage={currentPage}
                    themed={
                        isMealMaker ||
                        usesCollectionTheme ||
                        currentPage === 'recipe-detail' ||
                        currentPage === 'create-recipe'
                    }
                    editor={
                        isEditingIngredient
                            ? {
                                  formId: 'ingredient-detail-form',
                                  subject: 'ingredient',
                                  saving: ingredientEditor.saving,
                              }
                            : undefined
                    }
                    onBack={() => {
                        const parent = subPageParent[currentPage];
                        if (parent) navigateToPage(parent);
                    }}
                    onEdit={
                        currentPage === 'ingredient-detail'
                            ? () => ingredientDetailRef.current?.edit()
                            : undefined
                    }
                    onOpenMenu={() => {
                        lastMenuTriggerRef.current = menuButtonRef.current;
                        setIsSidebarOpen(true);
                    }}
                    onSignOut={handleSignOut}
                    menuOpen={isSidebarOpen}
                    menuButtonRef={menuButtonRef}
                />
                <NavigationPanel
                    currentPage={currentPage}
                    open={isSidebarOpen}
                    onClose={closeNavigation}
                    onHome={navigateToMeal}
                    onNavigate={(page) => {
                        if (page === 'meal-maker') navigateToMeal();
                        else navigateToPage(page);
                    }}
                    onSignOut={handleSignOut}
                />

                <div
                    className={`page-transition page-transition-${pageDirection}${isMealMaker ? ' page-transition-meal-maker' : ''}`}
                >
                    <main
                        className={`page-content ${isMealMaker ? 'page-content-meal-maker' : usesCollectionTheme ? 'page-content-saved-collection' : ''}`}
                    >
                        {isMealMaker && renderMealMakerWorkspace()}

                        {isIngredientsPage && (
                            <MyIngredients
                                isActive={currentPage === 'my-ingredients'}
                                ingredients={userIngredients}
                                refreshing={ingredientsRefreshing}
                                refreshError={ingredientsRefreshError}
                                onRefresh={() => void refreshUserIngredients()}
                                onDeleteMany={deleteUserIngredients}
                                onSaveFromDatabase={createUserIngredient}
                                onAdd={(ingredient, referencePhoto) => {
                                    setAddIngredientDraft(ingredient);
                                    setAddIngredientReferencePhoto(
                                        referencePhoto,
                                    );
                                    ingredientListScroll.current =
                                        document.querySelector(
                                            '.page-transition',
                                        )?.scrollTop ?? 0;
                                    navigateToPage('add-ingredient');
                                }}
                                onOpen={(ingredient) =>
                                    openSavedIngredient(ingredient)
                                }
                                onEdit={(ingredient) =>
                                    openSavedIngredient(ingredient, true)
                                }
                            />
                        )}

                        {currentPage === 'ingredient-detail' &&
                            selectedSavedIngredient && (
                                <IngredientDetail
                                    ref={ingredientDetailRef}
                                    ingredient={selectedSavedIngredient}
                                    onUpdate={updateUserIngredient}
                                    onEditorStateChange={setIngredientEditor}
                                />
                            )}

                        {currentPage === 'add-ingredient' && (
                            <AddIngredient
                                initialIngredient={addIngredientDraft}
                                referencePhoto={addIngredientReferencePhoto}
                                onBack={() => navigateToPage('my-ingredients')}
                                onSave={async (ingredient) => {
                                    await createUserIngredient(ingredient);
                                }}
                                findExistingIngredient={findExistingIngredient}
                                onEditorStateChange={setIngredientEditor}
                            />
                        )}

                        {(currentPage === 'my-journal' || hasVisitedPlan) && (
                            <MyJournal
                                key={`journal-${user.id}`}
                                isActive={currentPage === 'my-journal'}
                                savedIngredients={userIngredients}
                            />
                        )}

                        {currentPage === 'settings' && (
                            <Settings
                                mealGenerator={mealGenerator}
                                onMealGeneratorChange={(generator) => {
                                    saveMealGenerator(generator);
                                    setMealGenerator(generator);
                                }}
                            />
                        )}

                        {(isRecipesPage || hasVisitedRecipes) && (
                            <MyMeals
                                key={user.id}
                                isActive={currentPage === 'my-recipes'}
                                updatedRecipes={updatedRecipes}
                                onRecipesRefreshed={
                                    Object.keys(updatedRecipes).length
                                        ? () => setUpdatedRecipes({})
                                        : undefined
                                }
                                refreshKey={recipesRefreshKey}
                                onCreate={() => navigateToPage('create-recipe')}
                                onOpenRecipe={(recipe) => {
                                    setEditRecipeOnOpen(false);
                                    setSelectedRecipe(recipe);
                                    navigateToPage('recipe-detail');
                                }}
                                onEditRecipe={(recipe) => {
                                    setEditRecipeOnOpen(true);
                                    setSelectedRecipe(recipe);
                                    navigateToPage('recipe-detail');
                                }}
                            />
                        )}

                        {currentPage === 'recipe-detail' && selectedRecipe && (
                            <RecipeDetail
                                key={selectedRecipe.id}
                                recipe={selectedRecipe}
                                startInEditMode={editRecipeOnOpen}
                                savedIngredients={userIngredients}
                                onSave={saveMealChanges}
                            />
                        )}

                        {currentPage === 'create-recipe' && (
                            <CreateRecipe
                                savedIngredients={userIngredients}
                                onSave={createRecipe}
                            />
                        )}
                    </main>
                </div>
                {pageConfig[currentPage].type === 'main' && (
                    <BottomNavigation
                        currentPage={currentPage}
                        menuOpen={isSidebarOpen}
                        moreButtonRef={moreButtonRef}
                        onNavigate={(page) => {
                            if (page === 'meal-maker') navigateToMeal();
                            else navigateToPage(page);
                        }}
                        onMore={() => {
                            lastMenuTriggerRef.current = moreButtonRef.current;
                            setIsSidebarOpen(true);
                        }}
                    />
                )}
            </div>
        </IngredientCollectionContext>
    );
}

export default App;
