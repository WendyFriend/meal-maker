import { useState } from 'react';
import './MealResult.css';
import type { MealIngredient } from '../types';
import NutritionTable from './NutritionTable';
import MealTable from './MealTable';

type MealResultProps = {
    ingredients: MealIngredient[];
    onChange: (ingredients: MealIngredient[]) => void;
};

function MealResult({ ingredients, onChange }: MealResultProps) {

    const [isTotalUpdated, setIsTotalUpdated] = useState(false);

    function showTotalUpdated() {
        setIsTotalUpdated(true);

        setTimeout(() => {
            setIsTotalUpdated(false);
        }, 2500);
    }

    function handleMealIngredientsChange(ingredients: MealIngredient[]) {
        onChange(ingredients);
        showTotalUpdated();
    }

    return (
        <div className="meal-result">
            <h1>Your Meal</h1>
            <NutritionTable
                ingredients={ingredients}
                onChange={handleMealIngredientsChange}
            />

            <MealTable
                ingredients={ingredients}
                onChange={handleMealIngredientsChange}
                isTotalUpdated={isTotalUpdated}
            />
        </div>
    );
}

export default MealResult;
