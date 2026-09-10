import { useEffect, useState } from 'react';
import './App.css';
import '@ncdai/react-wheel-picker/style.css';
import type { AppError, ErrorResponse } from './meal-generator/types';
import {
    type GenerateMealRequest,
    type GenerateMealResponse,
    type IngredientInfo,
    type MealIngredient,
    type UserIngredient,
} from '../shared/types/types';
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
} from './lib/supabase';
import NutritionDialog from './meal-generator/components/NutritionDialog';

type CaloriesGoal = number | undefined;
type ProteinGoal = number | undefined;

function App() {
    const { user, loading, signOut } = useAuth();
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

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

    function getUserIngredient(
        ingredientName: string,
    ): IngredientInfo | undefined {
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
    ): IngredientInfo {
        return (
            getThisMealIngredient(ingredientName) ??
            getUserIngredient(ingredientName) ?? { name: ingredientName }
        );
    }

    async function updateUserIngredient(
        ingredientId: string,
        updatedIngredient: IngredientInfo,
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

    async function handleIngredientSave(
        savedIngredient: UserIngredient,
        saveToUserIngredients: boolean,
    ) {
        if (selectedIngredientIndex === null) return;

        try {
            const ingredientId = savedIngredient.ingredientId;

            // if user checks save to db
            if (saveToUserIngredients) {
                if (ingredientId) {
                    await updateUserIngredient(ingredientId, savedIngredient);
                } else {
                    await createUserIngredient(savedIngredient);
                }
            }

            // save ingredient nutritional info to use for this meal
            setThisMealIngredients((current) => {
                const exists = current.some(
                    (ingredient) => ingredient.name === savedIngredient.name,
                );

                return exists
                    ? current.map((ingredient) =>
                          ingredient.name === savedIngredient.name
                              ? savedIngredient
                              : ingredient,
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

            if (response.status === 422) {
                setError((payload as ErrorResponse).error);
                return;
            }
            if (!response.ok) throw new Error('Failed to generate meal');

            setMealIngredients(
                (payload as GenerateMealResponse).mealIngredients,
            );
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
        setIsAccountMenuOpen(false);
        await signOut();
    }

    if (loading) {
        return <p>Loading...</p>;
    }

    if (!user) {
        return <Login />;
    }

    return (
        <main>
            <header className="app-header">
                <h1>🍲 Meal Maker</h1>

                <div className="account-menu">
                    <button
                        type="button"
                        className="menu-trigger"
                        aria-label={
                            isAccountMenuOpen
                                ? 'Close account menu'
                                : 'Open account menu'
                        }
                        aria-haspopup="true"
                        aria-expanded={isAccountMenuOpen}
                        aria-controls="account-menu"
                        onClick={() =>
                            setIsAccountMenuOpen((isOpen) => !isOpen)
                        }
                    >
                        <span className="menu-icon" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                    </button>

                    {isAccountMenuOpen && (
                        <div id="account-menu" className="menu-popover">
                            <button
                                type="button"
                                className="logout-menu-item"
                                onClick={handleSignOut}
                            >
                                Log out
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <section>
                <IngredientInput
                    ingredients={ingredients}
                    onChange={setIngredients}
                    removeIngredient={removeIngredient}
                    onIngredientClick={setSelectedIngredientIndex}
                />
            </section>

            <section>
                <Calories value={caloriesGoal} onChange={setCaloriesGoal} />
            </section>

            <section>
                <Protein value={proteinGoal} onChange={setProteinGoal} />
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
                <p className="generating-message">Generating your meal...</p>
            )}

            {error?.code === 'REQUIREMENT_NOT_MET' && (
                <div className="error-message" role="alert">
                    {/* <div className="error-container"> */}
                    <div className="error-title">⚠️ {error.message}</div>

                    <div className="error-stats">
                        <div>
                            <span>Your goal: </span>
                            <strong>{error.proteinGoal}%</strong>
                        </div>

                        <div>
                            <span>Maximum possible: </span>
                            <strong>
                                {error.maximumProteinPercentage.toFixed(2)}%
                            </strong>
                        </div>
                    </div>

                    <div className="error-suggestion">
                        <p>Try:</p>
                        <ul>
                            <li>Lowering your protein goal</li>
                            <li>Adding a higher-protein ingredient</li>
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

            {!isGenerating && mealIngredients.length > 0 && (
                <MealResult
                    ingredients={mealIngredients}
                    onChange={setMealIngredients}
                />
            )}
        </main>
    );
}

export default App;
