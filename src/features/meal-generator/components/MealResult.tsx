import { useState } from 'react';
import './MealResult.css';
import type { GeneratedMeal, IngredientNutrition, Meal } from '../types';
import NutritionTable from './NutritionTable';
import MealTable from './MealTable';

type MealResultProps = {
    result: GeneratedMeal;
};

function MealResult({ result }: MealResultProps) {
    const [meal, setMeal] = useState(result.meal);
    const [nutrition, setNutrition] = useState(result.nutrition);

    const [isTotalUpdated, setIsTotalUpdated] = useState(false);

    function showTotalUpdated() {
        setIsTotalUpdated(true);

        setTimeout(() => {
            setIsTotalUpdated(false);
        }, 2500);
    }

    function handleNutritionChange(nutrition: IngredientNutrition[]) {
        setNutrition(nutrition);
        showTotalUpdated();
    }

    function handleMealChange(meal: Meal) {
        setMeal(meal);
        showTotalUpdated();
    }

    return (
        <div className="meal-result">
            <h1>Your Meal</h1>
            <NutritionTable
                nutrition={nutrition}
                onNutritionChange={handleNutritionChange}
            />

            <MealTable
                meal={meal}
                nutrition={nutrition}
                onMealChange={handleMealChange}
                isTotalUpdated={isTotalUpdated}
            />
        </div>
    );
}

export default MealResult;
