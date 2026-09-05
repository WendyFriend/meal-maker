import { describe, expect, it } from 'vitest';
import type { IngredientNutrition } from '../../client/meal-generator/types.ts';
import { checkProteinFeasibility } from './checkProteinFeasibility.ts';

describe('checkProteinFeasibility', () => {
    it('is feasible when no protein goal is specified', () => {
        const nutrition: IngredientNutrition[] = [];

        const result = checkProteinFeasibility(nutrition, undefined);

        expect(result).toEqual({
            feasible: true,
        });
    });

    it('is not feasible when there are no ingredients and a protein goal is specified', () => {
        const nutrition: IngredientNutrition[] = [];

        const result = checkProteinFeasibility(nutrition, 30);

        expect(result).toEqual({
            feasible: false,
            maximumProteinPercentage: 0,
        });
    });

    it('ignores ingredients with zero calories', () => {
        const nutrition: IngredientNutrition[] = [
            {
                name: 'Water',
                caloriesPer100g: 0,
                proteinPer100g: 10,
            },
        ];

        const result = checkProteinFeasibility(nutrition, 30);

        expect(result).toEqual({
            feasible: false,
            maximumProteinPercentage: 0,
        });
    });

    it('returns feasible when the protein goal is below the maximum possible percentage', () => {
        const nutrition: IngredientNutrition[] = [
            {
                name: 'Tofu',
                caloriesPer100g: 130,
                proteinPer100g: 14,
            },
        ];

        const result = checkProteinFeasibility(nutrition, 30);

        expect(result).toEqual({
            feasible: true,
        });
    });

    it('returns feasible when the protein goal exactly matches the maximum possible percentage', () => {
        const nutrition: IngredientNutrition[] = [
            {
                name: 'Tofu',
                caloriesPer100g: 100,
                proteinPer100g: 10,
            },
        ];

        // 10g protein × 4 kcal/g = 40 kcal from protein
        // 40 / 100 × 100 = 40%
        const result = checkProteinFeasibility(nutrition, 40);

        expect(result).toEqual({
            feasible: true,
        });
    });

    it('returns infeasible when the protein goal is above the maximum possible percentage', () => {
        const nutrition: IngredientNutrition[] = [
            {
                name: 'Tofu',
                caloriesPer100g: 130,
                proteinPer100g: 14,
            },
        ];

        const result = checkProteinFeasibility(nutrition, 90);

        expect(result).toEqual({
            feasible: false,
            maximumProteinPercentage: expect.closeTo((14 * 4 * 100) / 130, 10),
        });
    });

    it('uses the highest protein percentage among all ingredients', () => {
        const nutrition: IngredientNutrition[] = [
            {
                name: 'Pumpkin',
                caloriesPer100g: 26,
                proteinPer100g: 1,
            },
            {
                name: 'Tofu',
                caloriesPer100g: 130,
                proteinPer100g: 14,
            },
            {
                name: 'Oats',
                caloriesPer100g: 389,
                proteinPer100g: 17,
            },
        ];

        const result = checkProteinFeasibility(nutrition, 90);

        expect(result).toEqual({
            feasible: false,
            maximumProteinPercentage: expect.closeTo((14 * 4 * 100) / 130, 10),
        });
    });
});
