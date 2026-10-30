import type { IngredientNutrition } from '../../../shared/types/types.ts';
import type { USDAFood } from './types.ts';
import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';

export function mapUSDAFoodToIngredientNutrition(
    food: USDAFood,
): IngredientNutrition {
    return {
        ...Object.fromEntries(
            MICRONUTRIENTS.map(({ key, usda }) => [
                key,
                getNutrient(food, usda),
            ]),
        ),
        nutritionSource: { fdcId: food.fdcId, description: food.description },
        name: food.description,
        caloriesPer100g: getNutrient(food, 208) ?? 0,
        proteinPer100g: getNutrient(food, 203) ?? 0,
        carbohydratePer100g: getNutrient(food, 205) ?? 0,
        fatPer100g: getNutrient(food, 204) ?? 0,
        sugarPer100g: getNutrient(food, 269),
        saturatedFatPer100g: getNutrient(food, 606),
        fiberPer100g: getNutrient(food, 291),
    };
}

function getNutrient(
    food: USDAFood,
    nutrientNumber: number,
): number | undefined {
    const matchingNutrient = food.foodNutrients.find(
        (nutrient) => nutrient.nutrientNumber === String(nutrientNumber),
    );
    const value = matchingNutrient?.value;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}
