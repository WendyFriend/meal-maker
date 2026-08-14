import { useState } from 'react';
import IngredientInput from './features/meal-generator/components/IngredientInput';

function App() {
  const [ingredients, setIngredients] = useState<string[]>([]);

  return (
    <main>
      <h1>🍲 Meal Maker</h1>

      <section>
        <h2>What ingredients do you have?</h2>
        <IngredientInput ingredients={ingredients} onChange={setIngredients} />
      </section>

      <section>
        <h2>Calories</h2>

        <label>
          <input type="radio" name="calories" />
          No preference
        </label>

        <label>
          <input type="radio" name="calories" />
          500 kcal
        </label>
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
