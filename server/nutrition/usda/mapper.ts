import type { IngredientNutrition } from '../../../shared/types/types.ts';
import type { USDAFood } from './types.ts';

export function mapUSDAFoodToIngredientNutrition(
    food: USDAFood,
): IngredientNutrition {
    const proteinPer100g = getNutrient(food, '203');
    const carbohydratePer100g = getNutrient(food, '205', '205.2');
    const fatPer100g = getNutrient(food, '204', '298');
    // Foundation foods often only report Atwater energy (958/957), and a
    // few report none; fall back to 4/4/9 kcal per gram.
    const caloriesPer100g =
        getNutrient(food, '208', '958', '957') ||
        Math.round(
            4 * proteinPer100g + 4 * carbohydratePer100g + 9 * fatPer100g,
        );

    return {
        name: food.description,
        caloriesPer100g,
        proteinPer100g,
        carbohydratePer100g,
        fatPer100g,
        saturatedFatPer100g: getNutrient(food, '606'),
        fiberPer100g: getNutrient(food, '291'),
    };
}

// First of the given USDA nutrient numbers that the food reports.
function getNutrient(food: USDAFood, ...nutrientNumbers: string[]): number {
    for (const nutrientNumber of nutrientNumbers) {
        const matchingNutrient = food.foodNutrients.find(
            (nutrient) => nutrient.nutrientNumber === nutrientNumber,
        );

        if (matchingNutrient?.value !== undefined) {
            return matchingNutrient.value;
        }
    }

    return 0;
}
