// import type { IngredientNutrition } from './types.ts';
import type { IngredientNutrition } from '../../shared/types/types.ts';
import { searchFoods } from './usda/client.ts';
import { mapUSDAFoodToIngredientNutrition } from './usda/mapper.ts';
import type { IngredientInfo } from '../../shared/types/types.ts';

type CompleteNutrition = Pick<
    IngredientNutrition,
    'caloriesPer100g' | 'proteinPer100g' | 'carbohydratePer100g' | 'fatPer100g'
>;

export function hasCompleteNutrition(
    ingredient: IngredientInfo,
): ingredient is IngredientInfo & CompleteNutrition {
    return (
        ingredient.caloriesPer100g !== undefined &&
        ingredient.proteinPer100g !== undefined &&
        ingredient.carbohydratePer100g !== undefined &&
        ingredient.fatPer100g !== undefined
    );
}

export async function getNutritionForIngredients(
    ingredients: IngredientInfo[],
): Promise<{
    ingredientsWithNutrition: IngredientNutrition[];
    unresolvedIngredients: string[];
}> {
    const results = await Promise.allSettled(
        ingredients.map(async (ingredient): Promise<IngredientNutrition> => {
            if (hasCompleteNutrition(ingredient)) {
                return {
                    name: ingredient.name,
                    caloriesPer100g: ingredient.caloriesPer100g,
                    proteinPer100g: ingredient.proteinPer100g,
                    carbohydratePer100g: ingredient.carbohydratePer100g,
                    fatPer100g: ingredient.fatPer100g,
                    saturatedFatPer100g: ingredient.saturatedFatPer100g,
                    fiberPer100g: ingredient.fiberPer100g,
                };
            }

            const response = await searchFoods({
                query: ingredient.name,
            });

            const foods = response.foods;

            if (foods.length === 0) {
                throw new Error(
                    `No USDA food found for ingredient: "${ingredient.name}"`,
                );
            }

            return mapUSDAFoodToIngredientNutrition(foods[0]);
        }),
    );

    const ingredientsWithNutrition: IngredientNutrition[] = [];
    const unresolvedIngredients: string[] = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            ingredientsWithNutrition.push(result.value);
        } else {
            const name = ingredients[index].name;

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
