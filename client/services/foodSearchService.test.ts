import { afterEach, expect, it, vi } from 'vitest';
import {
    ingredientFromFoodSearch,
    searchNutritionLabFoods,
} from './foodSearchService';

afterEach(() => vi.unstubAllGlobals());

it('reuses a recent query despite case and spacing changes', async () => {
    const fetchResult = vi.fn(async (input: unknown) => {
        void input;
        return {
            ok: true,
            json: async () => ({ results: [] }),
        };
    });
    vi.stubGlobal('fetch', fetchResult);
    await searchNutritionLabFoods('  unique   buckwheat  ');
    await searchNutritionLabFoods('UNIQUE BUCKWHEAT');
    expect(fetchResult).toHaveBeenCalledOnce();
    expect(fetchResult.mock.calls[0][0]).toContain('unique%20buckwheat');
});

it('uses the selected search result nutrition and food identity', () => {
    expect(
        ingredientFromFoodSearch({
            fdcId: 170379,
            name: 'Broccoli',
            description: 'Broccoli, raw',
            per100g: {
                kcal: 34,
                proteinG: 2.8,
                carbsG: 6.6,
                fatG: 0.4,
                fibreG: 2.6,
                calciumMg: 47,
            },
        }),
    ).toMatchObject({
        name: 'Broccoli',
        nutritionSource: { fdcId: 170379 },
        caloriesPer100g: 34,
        fiberPer100g: 2.6,
        calciumPer100g: 47,
    });
});

it('does not save unknown required nutrition as zero', () => {
    expect(() =>
        ingredientFromFoodSearch({
            fdcId: 1,
            name: 'Unknown food',
            description: 'Unknown food',
            per100g: { kcal: 100, proteinG: null, carbsG: 10, fatG: 1 },
        }),
    ).toThrow('missing nutrition data');
});
