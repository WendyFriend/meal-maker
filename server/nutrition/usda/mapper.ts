import type { IngredientNutrition } from '../../../shared/types/types.ts';
import {
    NUTRIENTS,
    type Micronutrients,
} from '../../../shared/nutrition/nutrients.ts';
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
    const micronutrientsPer100g = getMicronutrients(food);

    return {
        name: food.description,
        caloriesPer100g,
        proteinPer100g,
        carbohydratePer100g,
        fatPer100g,
        sugarPer100g: micronutrientsPer100g.sugar,
        saturatedFatPer100g: micronutrientsPer100g.saturatedFat ?? 0,
        fiberPer100g: micronutrientsPer100g.fiber ?? 0,
        micronutrientsPer100g,
        usda: { fdcId: food.fdcId, description: food.description },
        nutritionSource: 'usda',
    };
}

/* Every tracked nutrient the food reports. Ones USDA leaves out are
   omitted rather than written as 0, which would read as "contains none". */
function getMicronutrients(food: USDAFood): Micronutrients {
    const micronutrients: Micronutrients = {};

    for (const nutrient of NUTRIENTS) {
        const value = findNutrient(food, nutrient.usdaNumbers);

        if (value !== undefined) {
            micronutrients[nutrient.key] = value;
        }
    }

    return micronutrients;
}

// First of the given USDA nutrient numbers that the food reports.
function findNutrient(
    food: USDAFood,
    nutrientNumbers: string[],
): number | undefined {
    for (const nutrientNumber of nutrientNumbers) {
        const matchingNutrient = food.foodNutrients.find(
            (nutrient) => nutrient.nutrientNumber === nutrientNumber,
        );

        if (
            typeof matchingNutrient?.value === 'number' &&
            Number.isFinite(matchingNutrient.value)
        ) {
            return matchingNutrient.value;
        }
    }

    return undefined;
}

function getNutrient(food: USDAFood, ...nutrientNumbers: string[]): number {
    return findNutrient(food, nutrientNumbers) ?? 0;
}
