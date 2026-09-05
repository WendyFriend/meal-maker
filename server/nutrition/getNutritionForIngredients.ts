// import type { IngredientNutrition } from './types.ts';
import type { IngredientNutrition } from '../../shared/types/types.ts';
import { searchFoods } from './usda/client.ts';
import { mapUSDAFoodToIngredientNutrition } from './usda/mapper.ts';

export async function getNutritionForIngredients(
    ingredientNames: string[],
): Promise<{
    ingredientsWithNutrition: IngredientNutrition[];
    unresolvedIngredients: string[];
}> {
    const results = await Promise.allSettled(
        ingredientNames.map(async (name) => {
            const response = await searchFoods({
                query: name,
            });
            const foods = response.foods;

            if (foods.length === 0) {
                throw new Error(`No USDA food found for ingredient: "${name}"`);
            }

            const food = foods[0];

            return mapUSDAFoodToIngredientNutrition(food);
        }),
    );

    const ingredientsWithNutrition: IngredientNutrition[] = [];
    const unresolvedIngredients: string[] = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            ingredientsWithNutrition.push(result.value);
        } else {
            const name = ingredientNames[index];

            console.error(
                `Failed to get nutrition for "${name}":`,
                result.reason,
            );

            unresolvedIngredients.push(name);
        }
    });

    return {
        ingredientsWithNutrition,
        unresolvedIngredients,
    };
}
