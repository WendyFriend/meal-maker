// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupFoodNutrition } from './lookupFood.js';

const rice = {
    fdcId: 169756,
    description: 'Rice, white, long-grain, regular, raw, unenriched',
    match: { tier: 'confident' },
    per100g: {
        kcal: 365,
        proteinG: 7.13,
        carbsG: 79.95,
        fatG: 0.66,
        sugarG: null,
        fibreG: 1.3,
        satFatG: null,
    },
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
}

describe('lookupFoodNutrition with the MealMaker API', () => {
    beforeEach(() => {
        vi.stubEnv('MEALMAKER_API_KEY', 'mm_test_key');
        vi.stubEnv('MEALMAKER_API_URL', 'https://example.test/api/v1');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('maps macros and micronutrients, keeping unknown values undefined', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (url) =>
            String(url).endsWith('/foods/resolve')
                ? jsonResponse({ results: [{ term: 'rice', food: rice }] })
                : jsonResponse({
                      fdcId: rice.fdcId,
                      description: rice.description,
                      nutrientsPer100g: [
                          { nbr: '303', name: 'Iron', unit: 'MG', amount: 0.8 },
                          { nbr: '304', name: 'Mg', unit: 'MG', amount: 25 },
                      ],
                  }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await lookupFoodNutrition('rice', 'nutrition-lab');

        expect(result).toMatchObject({
            caloriesPer100g: 365,
            proteinPer100g: 7.13,
            fiberPer100g: 1.3,
            ironPer100g: 0.8,
            magnesiumPer100g: 25,
            nutritionSource: { fdcId: 169756 },
        });
        expect(result.sugarPer100g).toBeUndefined();
        expect(result.zincPer100g).toBeUndefined();
        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            headers: expect.objectContaining({
                Authorization: 'Bearer mm_test_key',
            }),
        });
    });

    it('uses USDA by default even when the Nutrition Lab key is configured', async () => {
        vi.stubEnv('USDA_API_KEY', 'usda_test_key');
        const fetchMock = vi.fn<typeof fetch>(async () =>
            jsonResponse({
                foods: [
                    {
                        fdcId: rice.fdcId,
                        description: rice.description,
                        foodNutrients: [],
                    },
                ],
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await lookupFoodNutrition('rice');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            'https://api.nal.usda.gov/',
        );
    });

    it('does not silently fall back to USDA when Nutrition Lab is selected without a key', async () => {
        vi.stubEnv('MEALMAKER_API_KEY', '');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(
            lookupFoodNutrition('rice', 'nutrition-lab'),
        ).rejects.toThrow('MEALMAKER_API_KEY');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still returns macros when the detail request fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(async (url) =>
                String(url).endsWith('/foods/resolve')
                    ? jsonResponse({ results: [{ term: 'rice', food: rice }] })
                    : jsonResponse(
                          { error: { code: 'DATABASE_UNAVAILABLE' } },
                          503,
                      ),
            ),
        );
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await lookupFoodNutrition('rice', 'nutrition-lab');

        expect(result.caloriesPer100g).toBe(365);
        expect(result.ironPer100g).toBeUndefined();
    });

    it('rejects when nothing matches', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                jsonResponse({ results: [{ term: 'zzz', food: null }] }),
            ),
        );

        await expect(
            lookupFoodNutrition('zzz', 'nutrition-lab'),
        ).rejects.toThrow('No matching food');
    });

    it('rejects a weak match that does not describe the ingredient', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                jsonResponse({
                    results: [
                        {
                            term: 'tofu',
                            food: { ...rice, match: { tier: 'weak' } },
                        },
                    ],
                }),
            ),
        );

        await expect(
            lookupFoodNutrition('tofu', 'nutrition-lab'),
        ).rejects.toThrow('No matching food');
    });

    it('accepts an ambiguous synonym match such as capsicum', async () => {
        const pepper = {
            ...rice,
            fdcId: 170108,
            description: 'Peppers, sweet, red, raw',
            match: { tier: 'ambiguous', matchedVia: 'synonym:capsicum' },
        };
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(async (url) =>
                String(url).endsWith('/foods/resolve')
                    ? jsonResponse({
                          results: [{ term: 'capsicum', food: pepper }],
                      })
                    : jsonResponse({
                          fdcId: 170108,
                          description: pepper.description,
                          nutrientsPer100g: [],
                      }),
            ),
        );

        const result = await lookupFoodNutrition('capsicum', 'nutrition-lab');

        expect(result.nutritionSource?.fdcId).toBe(170108);
    });
});
