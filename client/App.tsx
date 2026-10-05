import { useEffect, useState } from 'react';
import './App.css';
import './Sidebar.css';
import '@ncdai/react-wheel-picker/style.css';
import type { AppError, ErrorResponse } from './meal-generator/types';
import {
    type GenerateMealRequest,
    type GenerateMealResponse,
    type IngredientInfo,
    type MealIngredient,
    type UserIngredient,
} from '../shared/types/types';
import MyIngredients from './MyIngredients';
import IngredientInput from './meal-generator/components/IngredientInput';
import Calories from './meal-generator/components/Calories';
import Protein from './meal-generator/components/Protein';
import MealResult from './meal-generator/components/MealResult';
import { useAuth } from './auth/AuthContext';
import Login from './auth/Login';
import {
    getUserIngredients,
    saveUserIngredient as saveUserIngredientToDB,
    updateUserIngredient as updateUserIngredientInDB,
    deleteUserIngredient as deleteUserIngredientInDB,
} from './lib/supabase';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import AddIngredient from './AddIngredient';
import { isUserIngredient } from './utils/Ingredient';

type CaloriesGoal = number | undefined;
type ProteinGoal = number | undefined;

type Page = keyof typeof pageConfig;

const pageConfig = {
    'meal-maker': {
        type: 'main',
        title: '🍲 Meal Maker',
    },
    'my-ingredients': {
        type: 'main',
        title: 'My Ingredients',
    },
    'food-log': {
        type: 'main',
        title: 'My Food Log',
    },
    'add-ingredient': {
        type: 'sub',
        title: 'Add Ingredient',
    },
} as const;

const navigationItems: {
    id: Page;
    label: string;
}[] = [
    {
        id: 'meal-maker',
        label: '🍲 Meal Maker',
    },
    {
        id: 'my-ingredients',
        label: '🥕 My Ingredients',
    },
    {
        id: 'food-log',
        label: '📖 My Food Log',
    },
];

function App() {
    const { user, loading, signOut } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState<Page>('meal-maker');
    const [pageDirection, setPageDirection] = useState<'none' | 'right'>(
        'none',
    );

    const [ingredients, setIngredients] = useState<string[]>([]);
    const [selectedIngredientIndex, setSelectedIngredientIndex] = useState<
        number | null
    >(null);

    const [userIngredients, setUserIngredients] = useState<UserIngredient[]>(
        [],
    );
    // ingredient with nutritional information used for this meal, created when user deselect "save to ingredients"
    const [thisMealIngredients, setThisMealIngredients] = useState<
        IngredientInfo[]
    >([]);

    const [caloriesGoal, setCaloriesGoal] = useState<CaloriesGoal>(undefined);
    const [proteinGoal, setProteinGoal] = useState<ProteinGoal>(undefined);

    const [mealIngredients, setMealIngredients] = useState<MealIngredient[]>(
        [],
    );
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<AppError>();

    const config = pageConfig[currentPage];

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

    function navigateToPage(page: Page) {
        const isReturning =
            currentPage === 'add-ingredient' && page === 'my-ingredients';

        setPageDirection(isReturning ? 'right' : 'none');

        setCurrentPage(page);
    }

    function getUserIngredient(
        ingredientName: string,
    ): UserIngredient | undefined {
        return userIngredients.find(
            (ingredient) =>
                ingredient.name.toLowerCase() === ingredientName.toLowerCase(),
        );
    }

    function getThisMealIngredient(
        ingredientName: string,
    ): IngredientInfo | undefined {
        return thisMealIngredients.find(
            (ingredient) =>
                ingredient.name.toLowerCase() === ingredientName.toLowerCase(),
        );
    }

    function getIngredientInfoFromStoredData(
        ingredientName: string,
    ): IngredientInfo | UserIngredient {
        return (
            getThisMealIngredient(ingredientName) ??
            getUserIngredient(ingredientName) ?? { name: ingredientName }
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
        if (!('ingredientId' in ingredient)) return;
        // to do: error handling
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

    function getIngredientsInfo(ingredients: string[]): IngredientInfo[] {
        return ingredients.map((ingredientName) =>
            getIngredientInfoFromStoredData(ingredientName),
        );
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
        setMealIngredients([]);
        setError(undefined);
        try {
            const input: GenerateMealRequest = {
                ingredients: getIngredientsInfo(ingredients),
                requirements: {
                    calories: caloriesGoal,
                    proteinPercentage: proteinGoal,
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

            setMealIngredients(mealResponse.ingredients);
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
        const normalizedName = name.trim().toLowerCase();

        return userIngredients.find(
            (ingredient) =>
                ingredient.name.trim().toLowerCase() === normalizedName,
        )?.name;
    }

    if (loading) {
        return <p>Loading...</p>;
    }

    if (!user) {
        return <Login />;
    }

    return (
        <div className="app">
            <header className="page-header">
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
                        onClick={() => navigateToPage('my-ingredients')}
                        aria-label="Back"
                    >
                        ‹
                    </button>
                )}

                <h1> {config.title}</h1>
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
            >
                <nav className="sidebar-nav">
                    {navigationItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="sidebar-item"
                            onClick={() => {
                                navigateToPage(item.id);
                                setIsSidebarOpen(false);
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
                <button
                    type="button"
                    className="sidebar-item sidebar-logout"
                    onClick={handleSignOut}
                >
                    Log out
                </button>
            </aside>

            <div
                key={currentPage}
                className={`page-transition page-transition-${pageDirection}`}
            >
                {currentPage === 'meal-maker' && (
                    <>
                        <section>
                            <IngredientInput
                                ingredients={ingredients}
                                savedIngredients={userIngredients}
                                onChange={setIngredients}
                                removeIngredient={removeIngredient}
                                onIngredientClick={setSelectedIngredientIndex}
                            />
                        </section>
                        <section>
                            <Calories
                                value={caloriesGoal}
                                onChange={setCaloriesGoal}
                            />
                        </section>
                        <section>
                            <Protein
                                value={proteinGoal}
                                onChange={setProteinGoal}
                            />
                        </section>
                        <button
                            type="button"
                            className="create-button"
                            onClick={handleCreate}
                        >
                            Create
                        </button>

                        {selectedIngredientIndex !== null && (
                            <NutritionDialog
                                ingredientInfo={getIngredientInfoFromStoredData(
                                    ingredients[selectedIngredientIndex],
                                )}
                                onClose={() => setSelectedIngredientIndex(null)}
                                onSave={handleIngredientSave}
                            />
                        )}

                        {isGenerating && (
                            <p className="generating-message">
                                Generating your meal...
                            </p>
                        )}

                        {error?.code === 'REQUIREMENT_NOT_MET' && (
                            <div className="error-message" role="alert">
                                {/* <div className="error-container"> */}
                                <div className="error-title">
                                    ⚠️ {error.message}
                                </div>

                                <div className="error-stats">
                                    <div>
                                        <span>Your goal: </span>
                                        <strong>{error.proteinGoal}%</strong>
                                    </div>

                                    <div>
                                        <span>Maximum possible: </span>
                                        <strong>
                                            {error.maximumProteinPercentage.toFixed(
                                                2,
                                            )}
                                            %
                                        </strong>
                                    </div>
                                </div>

                                <div className="error-suggestion">
                                    <p>Try:</p>
                                    <ul>
                                        <li>Lowering your protein goal</li>
                                        <li>
                                            Adding a higher-protein ingredient
                                        </li>
                                    </ul>
                                </div>
                                {/* </div> */}
                            </div>
                        )}

                        {error?.code === 'UNKNOWN_ERROR' && (
                            <div className="error-message" role="alert">
                                {error.message}
                            </div>
                        )}

                        {!isGenerating && mealIngredients?.length > 0 && (
                            <MealResult
                                ingredients={mealIngredients}
                                onChange={setMealIngredients}
                            />
                        )}
                    </>
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
            </div>
        </div>
    );
}

export default App;
