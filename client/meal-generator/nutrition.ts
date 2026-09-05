import { mockIngredientNutrition } from './mockData';
import type { IngredientNutrition } from './types';

export function findNutrition(
    ingredientName: string,
): IngredientNutrition | undefined {
    const normalizedName = ingredientName.trim().toLowerCase();

    return mockIngredientNutrition.find(
        (ingredient) => ingredient.name.toLowerCase() === normalizedName,
    );
}
