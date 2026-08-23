import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import Calories from './features/meal-generator/components/Calories';
import Protein from './features/meal-generator/components/Protein';
import './App.css';
import MealResult from './features/meal-generator/components/MealResult';
import type {
    GenerateMealInput,
    Meal,
} from './features/meal-generator/meal-generator/types';
import { generateMeal } from './features/meal-generator/meal-generator/generateMeal';

function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [meal, setMeal] = useState<Meal | undefined>(undefined);

    async function handleCreate() {
        const input: GenerateMealInput = {
            ingredients: [],
            requirements: {
                calories: 500,
                proteinPercentage: 20,
            },
        };

        const meal = await generateMeal(input);
        setMeal(meal);
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
                <Calories />
            </section>

            <section>
                <Protein />
            </section>

            <button
                type="button"
                className="create-button"
                onClick={handleCreate}
            >
                Create
            </button>

            {meal && <MealResult meal={meal} />}
        </main>
    );
}

export default App;
