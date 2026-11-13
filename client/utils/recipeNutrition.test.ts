import { expect, it } from 'vitest';
import type { MealIngredient } from '../../shared/types/types';
import {
    fillMissingRecipeNutrition,
    recipeNutritionEnrichments,
} from './recipeNutrition';

const ingredient: MealIngredient = {
    name: 'Brown rice',
    weight: 100,
    caloriesPer100g: 123,
    proteinPer100g: 3,
    carbohydratePer100g: 26,
    fatPer100g: 1,
    ironPer100g: 0,
    calciumPer100g: 2,
    zincPer100g: undefined,
    unavailableMicronutrients: ['magnesiumPer100g'],
};

it('fills only absent nutrients and preserves saved zeroes and unavailable fields', () => {
    const enrichments = recipeNutritionEnrichments([ingredient], {
        'brown rice': {
            name: 'Rice, brown',
            ironPer100g: 3,
            calciumPer100g: 10,
            magnesiumPer100g: 4,
            zincPer100g: 1.2,
            fiberPer100g: 2.5,
        },
    });

    expect(enrichments).toEqual([
        {
            index: 0,
            name: 'Brown rice',
            nutrients: { zincPer100g: 1.2, fiberPer100g: 2.5 },
        },
    ]);
    expect(
        fillMissingRecipeNutrition([ingredient], enrichments)[0],
    ).toMatchObject({
        ironPer100g: 0,
        calciumPer100g: 2,
        zincPer100g: 1.2,
        fiberPer100g: 2.5,
    });
});

it('does not apply a late lookup to a renamed or removed ingredient', () => {
    const enrichments = [
        { index: 0, name: 'Brown rice', nutrients: { zincPer100g: 1 } },
    ];
    const renamed = [{ ...ingredient, name: 'White rice' }];
    expect(fillMissingRecipeNutrition(renamed, enrichments)).toBe(renamed);
    expect(fillMissingRecipeNutrition([], enrichments)).toEqual([]);
});
