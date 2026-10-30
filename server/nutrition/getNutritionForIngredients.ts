import type { IngredientNutrition } from '../../shared/types/types.ts';
import type { IngredientInfo } from '../../shared/types/types.ts';
import { matchesFoodDescription } from './usda/selectFood.js';
import { lookupFoodNutrition } from './lookupFood.js';
import { MICRONUTRIENTS } from '../../shared/micronutrients.js';

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
    provider: 'usda' | 'nutrition-lab' = 'usda',
): Promise<{
    ingredientsWithNutrition: IngredientNutrition[];
    unresolvedIngredients: string[];
}> {
    const results = await Promise.allSettled(
        ingredients.map(async (original): Promise<IngredientNutrition> => {
            // Discard previously looked-up values when their source is a
            // different food form. User-entered values without a source remain intact.
            const ingredient: IngredientInfo =
                original.nutritionSource &&
                !matchesFoodDescription(
                    original.name,
                    original.nutritionSource.description,
                )
                    ? {
                          name: original.name,
                          preparationTips: original.preparationTips,
                      }
                    : original;
            if (
                hasCompleteNutrition(ingredient) &&
                ingredient.sugarPer100g !== undefined &&
                ingredient.saturatedFatPer100g !== undefined &&
                ingredient.fiberPer100g !== undefined &&
                MICRONUTRIENTS.every(
                    ({ key }) =>
                        typeof ingredient[key] === 'number' &&
                        Number.isFinite(ingredient[key]) &&
                        ingredient[key] >= 0,
                ) &&
                ingredient.nutritionSource !== undefined &&
                matchesFoodDescription(
                    ingredient.name,
                    ingredient.nutritionSource.description,
                )
            ) {
                return ingredient;
            }

            try {
                const nutrition = await lookupFoodNutrition(
                    ingredient.name,
                    provider,
                );
                // Preserve supplied values (including zero) and ingredient identity.
                return {
                    ...nutrition,
                    ...Object.fromEntries(
                        Object.entries(ingredient).filter(
                            ([, value]) =>
                                value !== undefined && value !== null,
                        ),
                    ),
                    name: ingredient.name,
                    caloriesPer100g:
                        ingredient.caloriesPer100g ?? nutrition.caloriesPer100g,
                    proteinPer100g:
                        ingredient.proteinPer100g ?? nutrition.proteinPer100g,
                    carbohydratePer100g:
                        ingredient.carbohydratePer100g ??
                        nutrition.carbohydratePer100g,
                    fatPer100g: ingredient.fatPer100g ?? nutrition.fatPer100g,
                    sugarPer100g:
                        ingredient.sugarPer100g ?? nutrition.sugarPer100g,
                    saturatedFatPer100g:
                        ingredient.saturatedFatPer100g ??
                        nutrition.saturatedFatPer100g,
                    fiberPer100g:
                        ingredient.fiberPer100g ?? nutrition.fiberPer100g,
                };
            } catch (error) {
                // Missing optional nutrition must not block meal generation.
                if (hasCompleteNutrition(ingredient)) {
                    console.warn(
                        `Additional nutrition unavailable for "${ingredient.name}"`,
                    );
                    return ingredient;
                }
                throw error;
            }
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
