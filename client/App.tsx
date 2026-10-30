import PageHeader from './navigation/PageHeader';
import NavigationPanel from './navigation/NavigationPanel';
import { subPageParent, type Page } from './navigation/pages';
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
import { updateRecipe } from './services/recipeService';
import IngredientInput from './meal-generator/components/IngredientInput';
import Calories from './meal-generator/components/Calories';
import { MealMakerIntro } from './meal-generator/components/MealMakerIntro';
import './meal-generator/MealMaker.css';
import MealResult from './meal-generator/components/MealResult';
import { useAuth } from './auth/useAuth';
import Login from './auth/Login';
import AuthLoading from './auth/AuthLoading';
import {
    getUserIngredients,
    saveUserIngredient as saveUserIngredientToDB,
    updateUserIngredient as updateUserIngredientInDB,
    deleteUserIngredients as deleteUserIngredientsInDB,
} from './services/ingredientService';
import type { Recipe } from '../shared/types/recipe';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import AddIngredient from './AddIngredient';
import { isUserIngredient, normalizeIngredientName } from './utils/Ingredient';
import LoadingSpinner from './components/LoadingSpinner';

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

function App() {
    const { user, loading, signOut } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);

    const [currentPage, setCurrentPage] = useState<Page>('meal-maker');
    const [pageDirection, setPageDirection] = useState<
        'none' | 'right' | 'left'
    >('none');

    const [ingredients, setIngredients] = useState<string[]>([]);
    const [selectedIngredientIndex, setSelectedIngredientIndex] = useState<
        number | null
    >(null);

    const [userIngredients, setUserIngredients] = useState<UserIngredient[]>(
        [],
    );
    const [selectedSavedIngredientId, setSelectedSavedIngredientId] =
        useState<string>();
    const [ingredientEditor, setIngredientEditor] = useState({
        editing: false,
        saving: false,
    });
    const isEditingIngredient =
        currentPage === 'add-ingredient' ||
        (currentPage === 'ingredient-detail' && ingredientEditor.editing);
    const [mealEditor, setMealEditor] = useState({
        editing: false,
        saving: false,
    });
    const isEditingMeal = currentPage === 'recipe-detail' && mealEditor.editing;
    const [updatedRecipes, setUpdatedRecipes] = useState<
        Record<string, Recipe>
    >({});
    const ingredientDetailRef = useRef<DetailEditorHandle>(null);
    const mealDetailRef = useRef<DetailEditorHandle>(null);
    const ingredientListScroll = useRef(0);
    const previousPage = useRef<Page>(currentPage);
    // Nutrition edits kept for this meal when "Save to Ingredients" is unchecked.
    const [thisMealIngredients, setThisMealIngredients] = useState<
        IngredientInfo[]
    >([]);

    const [caloriesGoal, setCaloriesGoal] = useState<number>();
    const [mealGenerator, setMealGenerator] =
        useState<MealGenerator>(loadMealGenerator);

    const [meal, setMeal] = useState<GenerateMealResponse | undefined>();
    const [originalMeal, setOriginalMeal] = useState<
        GenerateMealResponse | undefined
    >();
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<AppError>();

    // Recipe opened from the My Meals list; shown on the detail page.
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | undefined>();

    // Scroll target for the generated recipe; scrolls smoothly once the
    // result is ready (see handleCreate).
    const mealResultRef = useRef<HTMLDivElement>(null);
    const mealFormRef = useRef<HTMLDivElement>(null);
    const mealScreenRef = useRef<HTMLDivElement>(null);
    const pendingMealSection = useRef<'intro' | 'form' | null>(null);

    const scrollToMealSection = useCallback((section: 'intro' | 'form') => {
        const target =
            section === 'form'
                ? mealFormRef.current?.parentElement
                : mealScreenRef.current?.querySelector<HTMLElement>(
                      '.meal-maker-introduction',
                  );
        const focusTarget = section === 'form' ? mealFormRef.current : target;
        focusTarget?.focus({ preventScroll: true });
        target?.scrollIntoView({
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
            block: 'start',
        });
    }, []);
    useLayoutEffect(() => {
        if (currentPage === 'meal-maker' && pendingMealSection.current) {
            scrollToMealSection(pendingMealSection.current);
            pendingMealSection.current = null;
        }
    }, [currentPage, scrollToMealSection]);
    function closeNavigation() {
        menuButtonRef.current?.focus({ preventScroll: true });
        setIsSidebarOpen(false);
    }
    function navigateToMeal(section: 'intro' | 'form') {
        if (currentPage === 'meal-maker') scrollToMealSection(section);
        else {
            pendingMealSection.current = section;
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

    useEffect(() => {
        async function loadIngredients() {
            try {
                const ingredients = await getUserIngredients();
                setUserIngredients(ingredients);
            } catch (error) {
                console.error(error);
            }
        }

        loadIngredients();
    }, []);

    // The browser back gesture (swipe from the left edge, Android back
    // button) pops the history entry navigateToPage pushed when a sub-page
    // opened. Return to that sub-page's parent instead of leaving the app.
    useEffect(() => {
        function handlePopState() {
            const parent = subPageParent[currentPage];

            if (!parent) return;

            setPageDirection('right');
            setIngredientEditor({ editing: false, saving: false });
            setMealEditor({ editing: false, saving: false });
            setCurrentPage(parent);
        }

        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [currentPage]);

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
        }

        setPageDirection(isAdvancing ? 'left' : 'none');

        setIngredientEditor({ editing: false, saving: false });
        setMealEditor({ editing: false, saving: false });
        setCurrentPage(page);
    }

    function getIngredientInfoFromStoredData(
        ingredientName: string,
    ): IngredientInfo | UserIngredient {
        return (
            findIngredientByName(thisMealIngredients, ingredientName) ??
            findIngredientByName(userIngredients, ingredientName) ?? {
                name: ingredientName,
            }
        );
    }

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

    async function createUserIngredient(ingredient: IngredientInfo) {
        // update database user ingredients
        const created = await saveUserIngredientToDB(ingredient);
        // update local copy of user ingredients
        setUserIngredients((userIngredients) => [...userIngredients, created]);
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

    async function handleIngredientSave(
        savedIngredient: UserIngredient | IngredientInfo,
        saveToUserIngredients: boolean,
    ) {
        if (selectedIngredientIndex === null) return;

        try {
            // if user checks save to db
            if (saveToUserIngredients) {
                if (isUserIngredient(savedIngredient)) {
                    await updateUserIngredient(
                        savedIngredient.ingredientId,
                        savedIngredient,
                    );
                } else {
                    await createUserIngredient(savedIngredient);
                }
            } else {
                // save ingredient nutritional info to use for this meal
                setThisMealIngredients((current) => {
                    const exists = current.some(
                        (ingredient) =>
                            ingredient.name === savedIngredient.name,
                    );

                    return exists
                        ? current.map((ingredient) =>
                              ingredient.name === savedIngredient.name
                                  ? savedIngredient
                                  : ingredient,
                          )
                        : [...current, savedIngredient];
                });
            }

            // Always update the current meal ingredient
            setIngredients((ingredientNames) =>
                ingredientNames.map((ingredientName, index) =>
                    index === selectedIngredientIndex
                        ? savedIngredient.name
                        : ingredientName,
                ),
            );

            setSelectedIngredientIndex(null);
        } catch (error) {
            console.error(error);
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
                },
            };

            const response = await fetch('/api/generate-meal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Meal-Generator': mealGenerator,
                },
                body: JSON.stringify(input),
            });

            const payload = await response.json();

            console.log('generate-meal status:', response.status);
            console.log('generate-meal payload:', payload);

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

            setMeal(mealResponse);
            setOriginalMeal(mealResponse);

            // Bring the freshly generated recipe into view. Runs after the
            // result renders; falls back to a jump when motion is reduced.
            window.requestAnimationFrame(() => {
                const prefersReducedMotion = window.matchMedia(
                    '(prefers-reduced-motion: reduce)',
                ).matches;

                mealResultRef.current?.scrollIntoView({
                    behavior: prefersReducedMotion ? 'auto' : 'smooth',
                    block: 'start',
                });
            });
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
        await signOut();
    }

    function findExistingIngredient(name: string): string | undefined {
        return findIngredientByName(userIngredients, name)?.name;
    }

    if (loading) {
        return <AuthLoading />;
    }

    if (!user) {
        return <Login />;
    }

    return (
        <div className="app">
            <PageHeader
                currentPage={currentPage}
                themed={
                    isMealMaker ||
                    usesCollectionTheme ||
                    currentPage === 'recipe-detail'
                }
                editor={
                    isEditingIngredient
                        ? {
                              formId: 'ingredient-detail-form',
                              subject: 'ingredient',
                              saving: ingredientEditor.saving,
                          }
                        : isEditingMeal
                          ? {
                                formId: 'meal-detail-form',
                                subject: 'meal',
                                saving: mealEditor.saving,
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
                        : currentPage === 'recipe-detail'
                          ? () => mealDetailRef.current?.edit()
                          : undefined
                }
                onOpenMenu={() => setIsSidebarOpen(true)}
                onSignOut={handleSignOut}
                menuOpen={isSidebarOpen}
                menuButtonRef={menuButtonRef}
            />
            <NavigationPanel
                currentPage={currentPage}
                open={isSidebarOpen}
                onClose={closeNavigation}
                onHome={() => navigateToMeal('intro')}
                onNavigate={(page) => {
                    if (page === 'meal-maker') navigateToMeal('form');
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
                    {isMealMaker && (
                        <div className="meal-maker-screen" ref={mealScreenRef}>
                            <MealMakerIntro
                                onGetStarted={() => scrollToMealSection('form')}
                            />

                            <section
                                className="meal-maker-tool"
                                aria-label="Meal maker"
                            >
                                <div
                                    className="meal-maker-form"
                                    ref={mealFormRef}
                                    tabIndex={-1}
                                >
                                    <div className="meal-maker-fields">
                                        <IngredientInput
                                            ingredients={ingredients}
                                            savedIngredients={userIngredients}
                                            onChange={setIngredients}
                                            removeIngredient={removeIngredient}
                                            onIngredientClick={
                                                setSelectedIngredientIndex
                                            }
                                        />

                                        <section className="meal-maker-calories">
                                            <Calories
                                                value={caloriesGoal}
                                                onChange={setCaloriesGoal}
                                            />
                                        </section>
                                    </div>

                                    <button
                                        type="button"
                                        className="create-button meal-maker-create-button"
                                        onClick={handleCreate}
                                        disabled={
                                            isGenerating ||
                                            ingredients.length === 0
                                        }
                                    >
                                        {isGenerating ? (
                                            <>
                                                <LoadingSpinner
                                                    size="small"
                                                    tone="inherit"
                                                />
                                                Creating your meal…
                                            </>
                                        ) : (
                                            <>
                                                <span aria-hidden="true">
                                                    ✦
                                                </span>
                                                Create my meal
                                            </>
                                        )}
                                    </button>
                                </div>
                            </section>

                            {selectedIngredientIndex !== null && (
                                <NutritionDialog
                                    ingredientInfo={getIngredientInfoFromStoredData(
                                        ingredients[selectedIngredientIndex],
                                    )}
                                    onClose={() =>
                                        setSelectedIngredientIndex(null)
                                    }
                                    onSave={handleIngredientSave}
                                />
                            )}

                            {isGenerating && (
                                <div
                                    className="generating-indicator"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <LoadingSpinner size="large" />
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
                                <div
                                    ref={mealResultRef}
                                    className="meal-maker-result"
                                >
                                    <MealResult
                                        meal={meal}
                                        originalMeal={originalMeal}
                                        onChange={setMeal}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {isIngredientsPage && (
                        <MyIngredients
                            isActive={currentPage === 'my-ingredients'}
                            ingredients={userIngredients}
                            onDeleteMany={deleteUserIngredients}
                            onAdd={() => {
                                ingredientListScroll.current =
                                    document.querySelector('.page-transition')
                                        ?.scrollTop ?? 0;
                                navigateToPage('add-ingredient');
                            }}
                            onOpen={(ingredient) => {
                                ingredientListScroll.current =
                                    document.querySelector('.page-transition')
                                        ?.scrollTop ?? 0;
                                setIngredientEditor({
                                    editing: false,
                                    saving: false,
                                });
                                setSelectedSavedIngredientId(
                                    ingredient.ingredientId,
                                );
                                navigateToPage('ingredient-detail');
                            }}
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
                            onBack={() => navigateToPage('my-ingredients')}
                            onSave={createUserIngredient}
                            findExistingIngredient={findExistingIngredient}
                            onEditorStateChange={setIngredientEditor}
                        />
                    )}

                    {currentPage === 'my-journal' && <MyJournal />}

                    {currentPage === 'settings' && (
                        <Settings
                            mealGenerator={mealGenerator}
                            onMealGeneratorChange={(generator) => {
                                saveMealGenerator(generator);
                                setMealGenerator(generator);
                            }}
                        />
                    )}

                    {isRecipesPage && (
                        <MyMeals
                            isActive={currentPage === 'my-recipes'}
                            updatedRecipes={updatedRecipes}
                            onOpenRecipe={(recipe) => {
                                setSelectedRecipe(recipe);
                                navigateToPage('recipe-detail');
                            }}
                        />
                    )}

                    {currentPage === 'recipe-detail' && selectedRecipe && (
                        <RecipeDetail
                            ref={mealDetailRef}
                            key={selectedRecipe.id}
                            recipe={selectedRecipe}
                            onSave={saveMealChanges}
                            onEditorStateChange={setMealEditor}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
