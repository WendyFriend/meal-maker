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
} from './features/meal-generator/types';
import { generateMeal } from './features/meal-generator/generateMeal';
import { findNutrition } from './features/meal-generator/nutrition';

type CaloriesGoal = number | undefined;
type ProteinGoal = number | undefined;

function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);

    const [caloriesGoal, setCaloriesGoal] = useState<CaloriesGoal>(undefined);
    const [proteinGoal, setProteinGoal] = useState<ProteinGoal>(undefined);

    const [result, setResult] = useState<GeneratedMeal>();

    async function handleCreate() {
        const input: GenerateMealInput = {
            ingredients,
            nutrition: ingredients.map(findNutrition).filter(
                (ingredient): ingredient is IngredientNutrition =>
                    ingredient !== undefined, // checks whether ingredient is an IngredientNutrition.
            ),
            requirements: {
                calories: caloriesGoal,
                proteinPercentage: proteinGoal,
            },
        };

        const result = await generateMeal(input);

        setResult(result);
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

            {result && <MealResult result={result} />}
        </main>
    );
}

export default App;
