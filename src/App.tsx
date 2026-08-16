import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import TotalCalories from './features/meal-generator/components/TotalCalories';
import Protein from './features/meal-generator/components/Protein';
import './App.css';

type CaloriePreference = {
    enabled: boolean;
    value: number;
};

export type ProteinPreference = {
    type: 'grams' | 'percentage';
    grams: number;
    percentage: number;
} | null;

function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [caloriePreference, setCaloriePreference] =
        useState<CaloriePreference>({
            enabled: false,
            value: 500,
        });

    const [proteinPreference, setProteinPreference] =
        useState<ProteinPreference>(null);

    function onCaloriePreferenceEnabledChange(enabled: boolean): void {
        setCaloriePreference((previous) => ({
            ...previous,
            enabled,
        }));
    }

    function setCalorieValueChange(value: number): void {
        setCaloriePreference((previous) => ({
            ...previous,
            value,
        }));
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
                <TotalCalories
                    enabled={caloriePreference.enabled}
                    value={caloriePreference.value}
                    onEnabledChange={onCaloriePreferenceEnabledChange}
                    onValueChange={setCalorieValueChange}
                />
            </section>

            <section>
                <Protein
                    preference={proteinPreference}
                    onPreferenceChange={setProteinPreference}
                />
            </section>

            <button>Generate my meal</button>
        </main>
    );
}

export default App;
