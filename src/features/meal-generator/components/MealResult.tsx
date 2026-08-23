import { useState } from 'react';
import { mockIngredientNutrition } from '../mockData';
import './MealResult.css';
import type { IngredientNutrition, Meal } from '../meal-generator/types';
import NutritionTable from './NutritionTable';
import MealTable from './MealTable';

type MealResultProps = {
    meal: Meal;
};

function MealResult({ meal: initialMeal }: MealResultProps) {
    const [nutrition, setNutrition] = useState<IngredientNutrition[]>(
        mockIngredientNutrition,
    );

    const [meal, setMeal] = useState<Meal>(initialMeal);

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
