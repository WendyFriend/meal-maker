import { mockIngredientNutrition, mockMeal } from './mockData';
import type { GeneratedMeal, GenerateMealInput } from './types';

export async function generateMeal(
    input: GenerateMealInput,
): Promise<GeneratedMeal> {
    console.log(JSON.stringify(input));
    return {
        meal: mockMeal,
        nutrition: mockIngredientNutrition,
    };
}
