// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFoodLookupCache, lookupFoodNutrition } from './lookupFood.js';

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
        clearFoodLookupCache();
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

        const result = await lookupFoodNutrition('rice');

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

    it('requires the Nutrition Lab key', async () => {
        vi.stubEnv('MEALMAKER_API_KEY', '');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(lookupFoodNutrition('rice')).rejects.toThrow(
            'MEALMAKER_API_KEY',
        );
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

        const result = await lookupFoodNutrition('rice');

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

        await expect(lookupFoodNutrition('zzz')).rejects.toThrow(
            'No matching food',
        );
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

        await expect(lookupFoodNutrition('tofu')).rejects.toThrow(
            'No matching food',
        );
    });

    it('accepts a weak match when the normalized food name describes the ingredient', async () => {
        const redLentils = {
            ...rice,
            fdcId: 174284,
            description: 'Lentils, pink or red, raw',
            name: 'Red split lentils, dry',
            match: { tier: 'weak', matchedVia: 'words' },
        };
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(async (url) =>
                String(url).endsWith('/foods/resolve')
                    ? jsonResponse({
                          results: [
                              { term: 'red split lentils', food: redLentils },
                          ],
                      })
                    : jsonResponse({
                          fdcId: redLentils.fdcId,
                          description: redLentils.description,
                          nutrientsPer100g: [],
                      }),
            ),
        );

        const result = await lookupFoodNutrition('red split lentils');

        expect(result).toMatchObject({
            caloriesPer100g: 365,
            nutritionSource: { fdcId: 174284 },
        });
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

        const result = await lookupFoodNutrition('capsicum');

        expect(result.nutritionSource?.fdcId).toBe(170108);
    });
});

describe('lookupFoodNutrition cache', () => {
    beforeEach(() => {
        clearFoodLookupCache();
        vi.stubEnv('MEALMAKER_API_KEY', 'mm_test_key');
        vi.stubEnv('MEALMAKER_API_URL', 'https://example.test/api/v1');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    function stubResolve() {
        const fetchMock = vi.fn(async (url: string | URL | Request) =>
            String(url).endsWith('/foods/resolve')
                ? jsonResponse({ results: [{ term: 'rice', food: rice }] })
                : jsonResponse({ error: { code: 'not_found' } }, 404),
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('reuses a recent match and shares requests in flight', async () => {
        const fetchMock = stubResolve();
        const [first, second] = await Promise.all([
            lookupFoodNutrition('Rice'),
            lookupFoodNutrition(' rice '),
        ]);
        await lookupFoodNutrition('rice');
        expect(second).toBe(first);
        const resolves = fetchMock.mock.calls.filter(([url]) =>
            String(url).endsWith('/foods/resolve'),
        );
        expect(resolves).toHaveLength(1);
    });

    it('never caches failures', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({}, 503))
            .mockImplementation(async (url: string | URL | Request) =>
                String(url).endsWith('/foods/resolve')
                    ? jsonResponse({ results: [{ term: 'rice', food: rice }] })
                    : jsonResponse({ error: { code: 'not_found' } }, 404),
            );
        vi.stubGlobal('fetch', fetchMock);
        await expect(lookupFoodNutrition('rice')).rejects.toThrow();
        await expect(lookupFoodNutrition('rice')).resolves.toMatchObject({
            caloriesPer100g: 365,
        });
    });
});
