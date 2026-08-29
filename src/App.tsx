import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import Calories from './features/meal-generator/components/Calories';
import Protein from './features/meal-generator/components/Protein';
import './App.css';
import MealResult from './features/meal-generator/components/MealResult';
import type {
    AppError,
    ErrorResponse,
    GeneratedMeal,
    GenerateMealInput,
    IngredientNutrition,
    MealIngredient,
} from './features/meal-generator/types';
import { findNutrition } from './features/meal-generator/nutrition';

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
            const input: GenerateMealInput = {
                ingredients,
                nutrition: ingredients
                    .map(findNutrition)
                    .filter(
                        (ingredient): ingredient is IngredientNutrition =>
                            ingredient !== undefined,
                    ),
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

            if (response.status === 422) {
                const data: ErrorResponse = await response.json();

                setError(data.error);
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to generate meal');
            }

            const result: GeneratedMeal = await response.json();

            setMealIngredients(result.meal.ingredients);
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
