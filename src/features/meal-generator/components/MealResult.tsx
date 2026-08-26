import { useState } from 'react';
import './MealResult.css';
import type { GeneratedMeal, MealIngredient } from '../types';
import NutritionTable from './NutritionTable';
import MealTable from './MealTable';

type MealResultProps = {
    result: GeneratedMeal;
};

function MealResult({ result }: MealResultProps) {
    const [mealIngredients, setMealIngredients] = useState(result.meal.ingredients);

    const [isTotalUpdated, setIsTotalUpdated] = useState(false);

    function showTotalUpdated() {
        setIsTotalUpdated(true);

        setTimeout(() => {
            setIsTotalUpdated(false);
        }, 2500);
    }

    function handleMealIngredientsChange(ingredients: MealIngredient[]) {
        setMealIngredients(ingredients);
        showTotalUpdated();
    }

    return (
        <div className="meal-result">
            <h1>Your Meal</h1>
            <NutritionTable
                ingredients={mealIngredients}
                onChange={handleMealIngredientsChange}
            />

            <MealTable
                ingredients={mealIngredients}
                onChange={handleMealIngredientsChange}
                isTotalUpdated={isTotalUpdated}
            />
        </div>
    );
}

export default MealResult;
