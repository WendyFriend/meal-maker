import type { IngredientNutrition } from '../../../shared/types/types.ts';
import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';
import type { MealMakerFood, MealMakerFoodDetail } from './types.ts';

function valid(value: number | null | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}

export function mapMealMakerFoodToIngredientNutrition(
    food: MealMakerFood,
    detail: MealMakerFoodDetail | undefined,
): IngredientNutrition {
    const nutrient = (nbr: number) =>
        valid(
            detail?.nutrientsPer100g.find((item) => item.nbr === String(nbr))
                ?.amount,
        );

    return {
        ...Object.fromEntries(
            MICRONUTRIENTS.map(({ key, usda }) => [key, nutrient(usda)]),
        ),
        nutritionSource: { fdcId: food.fdcId, description: food.description },
        name: food.description,
        caloriesPer100g: nutrient(208) ?? valid(food.per100g.kcal) ?? 0,
        proteinPer100g: nutrient(203) ?? valid(food.per100g.proteinG) ?? 0,
        carbohydratePer100g: nutrient(205) ?? valid(food.per100g.carbsG) ?? 0,
        fatPer100g: nutrient(204) ?? valid(food.per100g.fatG) ?? 0,
        sugarPer100g: nutrient(269) ?? valid(food.per100g.sugarG),
        saturatedFatPer100g: nutrient(606) ?? valid(food.per100g.satFatG),
        fiberPer100g: nutrient(291) ?? valid(food.per100g.fibreG),
    };
}
