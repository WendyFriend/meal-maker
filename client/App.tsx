import { useEffect, useRef, useState } from 'react';
import './App.css';
import './Sidebar.css';
import type { AppError, ErrorResponse } from './meal-generator/types';
import {
    type GenerateMealRequest,
    type GenerateMealResponse,
    type IngredientInfo,
    type UserIngredient,
} from '../shared/types/types';
import MyIngredients from './MyIngredients';
import MyRecipes from './MyRecipes';
import RecipeDetail from './RecipeDetail';
import IngredientInput from './meal-generator/components/IngredientInput';
import Calories from './meal-generator/components/Calories';
import { MealMakerIntro } from './meal-generator/components/MealMakerIntro';
import './meal-generator/MealMaker.css';
import MealResult from './meal-generator/components/NewMealResult';
import { useAuth } from './auth/AuthContext';
import Login from './auth/Login';
import {
    getUserIngredients,
    saveUserIngredient as saveUserIngredientToDB,
    updateUserIngredient as updateUserIngredientInDB,
    deleteUserIngredient as deleteUserIngredientInDB,
} from './services/ingredientService';
import type { Recipe } from '../shared/types/recipe';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import AddIngredient from './AddIngredient';
import { isUserIngredient, normalizeIngredientName } from './utils/Ingredient';
import { APP_VERSION } from './version';
import cookingLoader from './assets/animations/cooking-loader.svg';

type Page = keyof typeof pageConfig;

const pageConfig = {
    'meal-maker': {
        type: 'main',
        title: 'Meal Maker',
    },
    'my-ingredients': {
        type: 'main',
        title: 'My Ingredients',
    },
    'my-recipes': {
        type: 'main',
        title: 'My Recipes',
    },
    'add-ingredient': {
        type: 'sub',
        title: 'Add Ingredient',
    },
    'recipe-detail': {
        type: 'sub',
        title: 'Recipe',
    },
    'create-recipe': {
        type: 'sub',
        title: 'Create Recipe',
    },
} as const;

const navigationItems: {
    id: Page;
    label: string;
}[] = [
    {
        id: 'meal-maker',
        label: 'Create Meal',
    },
    {
        id: 'my-ingredients',
        label: 'My Ingredients',
    },
    {
        id: 'my-recipes',
        label: 'My Recipes',
    },
];

/*
 * Sub-pages open on top of a parent page (see pageConfig). Entering a
 * sub-page pushes a browser history entry, so the mobile back gesture
 * (swipe from the left edge, Android back button) returns to the parent
 * page instead of leaving the app.
 */
const subPageParent: Partial<Record<Page, Page>> = {
    'add-ingredient': 'my-ingredients',
    'recipe-detail': 'my-recipes',
    'create-recipe': 'my-recipes',
};

function Brand({ className }: { className: string }) {
    return (
        <div className={className}>
            <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 36 36" focusable="false">
                    <path
                        fill="#628f64"
                        d="M17 13C8 13 7 8 8 5c6-1 10 2 9 8Z"
                    />
                    <path
                        fill="#eea66f"
                        d="M18 13C17 5 22 2 28 3c0 7-4 11-10 10Z"
                    />
                    <path
                        fill="#ff6552"
                        d="M2 15h32c-1 10-8 18-16 18S3 25 2 15Z"
                    />
                    <path
                        fill="#ff8c6f"
                        d="M3 15h9c-1 8 2 14 7 18C10 33 4 25 3 15Z"
                    />
                </svg>
            </span>
            <span className="brand-name">Meal Maker</span>
        </div>
    );
}

function NavigationLinks({
    currentPage,
    itemClassName,
    onNavigate,
}: {
    currentPage: Page;
    itemClassName: string;
    onNavigate: (page: Page) => void;
}) {
    return navigationItems.map(({ id, label }) => {
        const active = currentPage === id;
        return (
            <button
                key={id}
                type="button"
                className={`${itemClassName}${active ? ` ${itemClassName}-active` : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(id)}
            >
                {label}
            </button>
        );
    });
}

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
    // Nutrition edits kept for this meal when "Save to Ingredients" is unchecked.
    const [thisMealIngredients, setThisMealIngredients] = useState<
        IngredientInfo[]
    >([]);

    const [caloriesGoal, setCaloriesGoal] = useState<number>();

    const [meal, setMeal] = useState<GenerateMealResponse | undefined>();
    const [originalMeal, setOriginalMeal] = useState<
        GenerateMealResponse | undefined
    >();
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<AppError>();

    // Recipe opened from the My Recipes list; shown on the detail page.
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | undefined>();

    // Scroll target for the generated recipe; scrolls smoothly once the
    // result is ready (see handleCreate).
    const mealResultRef = useRef<HTMLDivElement>(null);
    const mealFormRef = useRef<HTMLDivElement>(null);

    const config = pageConfig[currentPage];
    const isMealMaker = currentPage === 'meal-maker';
    const isRecipesPage =
        currentPage === 'my-recipes' ||
        subPageParent[currentPage] === 'my-recipes';

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

    async function createUserIngredient(ingredient: IngredientInfo) {
        // update database user ingredients
        const created = await saveUserIngredientToDB(ingredient);
        // update local copy of user ingredients
        setUserIngredients((userIngredients) => [...userIngredients, created]);
    }

    async function deleteUserIngredient(ingredient: UserIngredient) {
        // remove user ingredient from database
        const deleted = await deleteUserIngredientInDB(ingredient);
        // remove local copy of user ingredient
        setUserIngredients((userIngredients) =>
            userIngredients.filter(
                (ingredient) =>
                    ingredient.ingredientId !== deleted.ingredientId,
            ),
        );
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
        return <p>Loading...</p>;
    }

    if (!user) {
        return <Login />;
    }

    return (
        <div className="app">
            <header
                className={`page-header ${isMealMaker ? 'page-header-meal-maker' : ''}`}
            >
                <div className="page-header-inner">
                    {config.type === 'main' ? (
                        <button
                            key="menu"
                            type="button"
                            className="page-header-menu"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open navigation menu"
                        >
                            <span className="menu-icon" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                            </span>
                        </button>
                    ) : (
                        <button
                            key="back"
                            type="button"
                            className="page-header-back"
                            onClick={() => {
                                const parent = subPageParent[currentPage];
                                if (parent) navigateToPage(parent);
                            }}
                            aria-label="Back"
                        >
                            ‹
                        </button>
                    )}

                    <Brand className="page-header-brand" />

                    {/* Desktop navigation */}
                    {config.type === 'main' && (
                        <nav className="page-header-nav" aria-label="Primary">
                            <NavigationLinks
                                currentPage={currentPage}
                                itemClassName="page-header-nav-item"
                                onNavigate={navigateToPage}
                            />
                        </nav>
                    )}

                    <div className="page-header-actions">
                        <button
                            type="button"
                            className="page-header-signout"
                            onClick={handleSignOut}
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </header>

            {/* Side Bar */}
            <div
                className={`sidebar-backdrop ${isSidebarOpen ? 'open' : ''}`}
                onClick={() => setIsSidebarOpen(false)}
                aria-hidden="true"
            />

            <aside
                id="sidebar"
                className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
                aria-label="Navigation"
            >
                <Brand className="sidebar-brand" />

                <nav className="sidebar-nav">
                    <NavigationLinks
                        currentPage={currentPage}
                        itemClassName="sidebar-item"
                        onNavigate={(page) => {
                            navigateToPage(page);
                            setIsSidebarOpen(false);
                        }}
                    />
                </nav>

                <button
                    type="button"
                    className="sidebar-item sidebar-logout"
                    onClick={handleSignOut}
                >
                    Log out
                </button>

                <div className="app-version">v{APP_VERSION}</div>
            </aside>

            <div className={`page-transition page-transition-${pageDirection}`}>
                <main
                    className={`page-content ${isMealMaker ? 'page-content-meal-maker' : ''}`}
                >
                    {isMealMaker && (
                        <div className="meal-maker-screen">
                            <MealMakerIntro
                                onGetStarted={() => {
                                    const form = mealFormRef.current;
                                    form?.focus({ preventScroll: true });
                                    form?.parentElement?.scrollIntoView({
                                        behavior: window.matchMedia(
                                            '(prefers-reduced-motion: reduce)',
                                        ).matches
                                            ? 'auto'
                                            : 'smooth',
                                        block: 'start',
                                    });
                                }}
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
                                                <span
                                                    className="button-spinner"
                                                    aria-hidden="true"
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
                                    <p className="meal-maker-form-note">
                                        Ingredient amounts, steps and nutrition
                                        included.
                                    </p>
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
                                    <img
                                        src={cookingLoader}
                                        alt=""
                                        className="generating-loader"
                                    />
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

                    {currentPage === 'my-ingredients' && (
                        <MyIngredients
                            ingredients={userIngredients}
                            onUpdate={updateUserIngredient}
                            onDelete={deleteUserIngredient}
                            onAdd={() => navigateToPage('add-ingredient')}
                        />
                    )}

                    {currentPage === 'add-ingredient' && (
                        <AddIngredient
                            onBack={() => navigateToPage('my-ingredients')}
                            onSave={createUserIngredient}
                            findExistingIngredient={findExistingIngredient}
                        />
                    )}

                    {isRecipesPage && (
                        <div hidden={currentPage !== 'my-recipes'}>
                            <MyRecipes
                                showAddButton={currentPage === 'my-recipes'}
                                onCreateRecipe={() =>
                                    navigateToPage('create-recipe')
                                }
                                onOpenRecipe={(recipe) => {
                                    setSelectedRecipe(recipe);
                                    navigateToPage('recipe-detail');
                                }}
                            />
                        </div>
                    )}

                    {currentPage === 'recipe-detail' && selectedRecipe && (
                        <RecipeDetail recipe={selectedRecipe} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
