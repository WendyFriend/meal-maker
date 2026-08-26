import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import Calories from './features/meal-generator/components/Calories';
import Protein from './features/meal-generator/components/Protein';
import './App.css';
import MealResult from './features/meal-generator/components/MealResult';
import type {
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

    async function handleCreate() {
        try {
            setIsGenerating(true);
            setMealIngredients([]);
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

            if (!response.ok) {
                throw new Error('Failed to generate meal');
            }

            const result: GeneratedMeal = await response.json();

            // setResult(result);
            setMealIngredients(result.meal.ingredients);
        } catch (error) {
            console.error(error);
            // Later: show an error message in the UI
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

            {isGenerating && <p>Generating your meal...</p>}

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
