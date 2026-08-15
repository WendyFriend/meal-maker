import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import TotalCalories from './features/meal-generator/components/TotalCalories';

type CaloriePreference = {
    enabled: boolean;
    value: number;
};

function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [caloriePreference, setCaloriePreference] =
        useState<CaloriePreference>({
            enabled: false,
            value: 500,
        });

    function onCaloriePreferenceEnabledChange(enabled: boolean): void {
        setCaloriePreference((previous) => ({
            ...previous,
            enabled
        }));
    }

    function setCalorieValueChange(value: number): void {
        setCaloriePreference((previous) => ({
            ...previous,
            value
        }));
    }

    return (
        <main>
            <h1>🍲 Meal Maker</h1>

            <section>
                <h2>What ingredients do you have?</h2>
                <IngredientInput
                    ingredients={ingredients}
                    onChange={setIngredients}
                />
            </section>

            <section>
                <h2>Calories</h2>
                <TotalCalories
                    enabled={caloriePreference.enabled}
                    value={caloriePreference.value}
                    onEnabledChange={onCaloriePreferenceEnabledChange}
                    onValueChange={setCalorieValueChange}
                />
            </section>

            <section>
                <h2>Protein</h2>

                <label>
                    <input type="radio" name="protein" />
                    No preference
                </label>

                <label>
                    <input type="radio" name="protein" />
                    40 g
                </label>
            </section>

            <button>Generate my meal</button>
        </main>
    );
}

export default App;
