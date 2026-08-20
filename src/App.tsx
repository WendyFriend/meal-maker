import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';
import Calories from './features/meal-generator/components/Calories';
import Protein from './features/meal-generator/components/Protein';
import './App.css';


function App() {
    const [ingredients, setIngredients] = useState<string[]>([]);

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

            <button className="create-button">Create</button>
        </main>
    );
}

export default App;
