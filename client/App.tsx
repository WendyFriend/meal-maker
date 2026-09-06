import { useState } from 'react';
import './App.css';
import '@ncdai/react-wheel-picker/style.css';
import type { AppError, ErrorResponse } from './meal-generator/types';
import {
    type GenerateMealRequest,
    type GenerateMealResponse,
    type IngredientInfo,
    type MealIngredient,
} from '../shared/types/types';
import IngredientInput from './meal-generator/components/IngredientInput';
import Calories from './meal-generator/components/Calories';
import Protein from './meal-generator/components/Protein';
import MealResult from './meal-generator/components/MealResult';
import { useAuth } from './auth/AuthContext';
import Login from './auth/Login';

type CaloriesGoal = number | undefined;
type ProteinGoal = number | undefined;

function App() {
    const { user, loading, signOut } = useAuth();
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

    const [ingredients, setIngredients] = useState<IngredientInfo[]>([]);

    const [caloriesGoal, setCaloriesGoal] = useState<CaloriesGoal>(undefined);
    const [proteinGoal, setProteinGoal] = useState<ProteinGoal>(undefined);

    const [mealIngredients, setMealIngredients] = useState<MealIngredient[]>(
        [],
    );
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<AppError>();

    async function handleCreate() {
        setIsGenerating(true);
        setMealIngredients([]);
        setError(undefined);
        try {
            const input: GenerateMealRequest = {
                ingredients,
                // nutrition: ingredients
                //     .map(findNutrition)
                //     .filter(
                //         (ingredient): ingredient is IngredientNutrition =>
                //             ingredient !== undefined,
                //     ),
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
