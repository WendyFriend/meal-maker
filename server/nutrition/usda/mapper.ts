import type { IngredientNutrition } from '../../../shared/types/types.ts';
import type { USDAFood } from './types.ts';

export function mapUSDAFoodToIngredientNutrition(
    food: USDAFood,
): IngredientNutrition {
    const result = {
        name: food.description,
        caloriesPer100g: getNutrient(food, 208),
        proteinPer100g: getNutrient(food, 203),
        carbohydratePer100g: getNutrient(food, 205),
        fatPer100g: getNutrient(food, 204),
        saturatedFatPer100g: getNutrient(food, 606),
        fiberPer100g: getNutrient(food, 291),
    };
    console.log('mapUSDAFoodToIngredientNutrition result: ', result);
    return result;
}

function getNutrient(food: USDAFood, nutrientNumber: number): number {
    const matchingNutrient = food.foodNutrients.find(
        (nutrient) => nutrient.nutrientNumber === String(nutrientNumber),
    );
    console.log('getNutrient result: ', matchingNutrient);
    return matchingNutrient?.value ?? 0;
}
