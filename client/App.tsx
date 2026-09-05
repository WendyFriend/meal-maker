import { useState } from 'react';
import './App.css';
import type { AppError, ErrorResponse } from './meal-generator/types';
import {
    type GenerateMealRequest,
    type GenerateMealResponse,
    type MealIngredient,
} from '../shared/types/types';
import IngredientInput from './meal-generator/components/IngredientInput';
import Calories from './meal-generator/components/Calories';
import Protein from './meal-generator/components/Protein';
import MealResult from './meal-generator/components/MealResult';

type CaloriesGoal = number | undefined;
type ProteinGoal = number | undefined;

function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);

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

    return (
        <main>
            <h1>🍲 Meal Maker</h1>

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
