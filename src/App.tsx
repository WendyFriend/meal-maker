import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import Calories from './features/meal-generator/components/Calories';
import Protein from './features/meal-generator/components/Protein';
import './App.css';
import MealResult from './features/meal-generator/components/MealResult';

function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [showResult, setShowResult] = useState(false);

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
                onClick={() => setShowResult(true)}
            >
                Create
            </button>

            {showResult && <MealResult />}
        </main>
    );
}

export default App;
