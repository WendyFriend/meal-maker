import { describe, expect, it } from 'vitest';
import { mapUSDAFoodToIngredientNutrition } from './mapper.ts';
import type { USDAFood } from './types.ts';

function food(nutrients: Record<string, number>, fdcId = 123): USDAFood {
    return {
        fdcId,
        dataType: 'SR Legacy',
        description: 'Spinach, raw',
        foodNutrients: Object.entries(nutrients).map(
            ([nutrientNumber, value]) => ({
                nutrientNumber,
                nutrientName: nutrientNumber,
                value,
                unitName: 'G',
            }),
        ),
    };
}

describe('mapUSDAFoodToIngredientNutrition micronutrients', () => {
    it('fills micronutrients from USDA nutrient numbers and tags the source', () => {
        const mapped = mapUSDAFoodToIngredientNutrition(
            food({
                '208': 23,
                '203': 2.9,
                '291': 2.2,
                '306': 558,
                '301': 99,
                '303': 2.71,
                '401': 28.1,
                '430': 483,
            }),
        );

        expect(mapped.micronutrientsPer100g).toEqual({
            fiber: 2.2,
            potassium: 558,
            calcium: 99,
            iron: 2.71,
            vitaminC: 28.1,
            vitaminK: 483,
        });
        expect(mapped.usda).toEqual({
            fdcId: 123,
            description: 'Spinach, raw',
        });
        expect(mapped.nutritionSource).toBe('usda');
    });

    it('omits nutrients USDA does not report instead of writing 0', () => {
        const { micronutrientsPer100g } = mapUSDAFoodToIngredientNutrition(
            food({ '208': 100, '301': 10 }),
        );

        expect(micronutrientsPer100g).toEqual({ calcium: 10 });
        expect(micronutrientsPer100g).not.toHaveProperty('iron');
    });

    it('keeps a reported zero', () => {
        const { micronutrientsPer100g } = mapUSDAFoodToIngredientNutrition(
            food({ '208': 100, '418': 0 }),
        );

        expect(micronutrientsPer100g).toEqual({ vitaminB12: 0 });
    });

    it('uses the first preferred nutrient number that is present', () => {
        expect(
            mapUSDAFoodToIngredientNutrition(food({ '269.3': 4.1 }))
                .sugarPer100g,
        ).toBe(4.1);
        expect(
            mapUSDAFoodToIngredientNutrition(food({ '269': 5, '269.3': 4.1 }))
                .sugarPer100g,
        ).toBe(5);
        // Folate: DFE (435) before total folate (417).
        expect(
            mapUSDAFoodToIngredientNutrition(food({ '417': 50, '435': 80 }))
                .micronutrientsPer100g?.folate,
        ).toBe(80);
        expect(
            mapUSDAFoodToIngredientNutrition(food({ '417': 50 }))
                .micronutrientsPer100g?.folate,
        ).toBe(50);
    });

    it('keeps the top-level fibre, saturated fat and sugar in sync', () => {
        const mapped = mapUSDAFoodToIngredientNutrition(
            food({ '291': 3, '606': 1.5, '269': 2 }),
        );

        expect(mapped.fiberPer100g).toBe(3);
        expect(mapped.saturatedFatPer100g).toBe(1.5);
        expect(mapped.sugarPer100g).toBe(2);
        expect(
            mapUSDAFoodToIngredientNutrition(food({})).sugarPer100g,
        ).toBeUndefined();
    });
});
