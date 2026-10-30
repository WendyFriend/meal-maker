// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handleGenerateMealRequest,
    parseMealGenerator,
} from './handleGenerateMealRequest.js';
import { generateMealWithNutritionLab } from './algorithms/generateMealNutritionLab.js';

describe('parseMealGenerator', () => {
    it('defaults to Ollama, accepts known values and rejects others', () => {
        expect(parseMealGenerator(undefined)).toBe('ollama');
        expect(parseMealGenerator('nutrition-lab')).toBe('nutrition-lab');
        expect(parseMealGenerator(['ollama'])).toBe('ollama');
        expect(parseMealGenerator('gpt')).toBeUndefined();
    });
});

describe('generateMealWithNutritionLab', () => {
    beforeEach(() => {
        vi.stubEnv('MEALMAKER_API_KEY', 'mm_test_key');
        vi.stubEnv('MEALMAKER_API_URL', 'https://example.test/api/v1');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('routes Nutrition Lab selection only to its generation API', async () => {
        const fetchMock = vi.fn<typeof fetch>(
            async () =>
                new Response(
                    JSON.stringify({
                        mealName: 'Rice bowl',
                        instructions: ['Serve.'],
                        ingredients: [
                            {
                                name: 'rice',
                                weight: 100,
                                caloriesPer100g: 365,
                                proteinPer100g: 7,
                                carbohydratePer100g: 80,
                                fatPer100g: 1,
                            },
                        ],
                    }),
                ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const result = await handleGenerateMealRequest(
            { ingredients: [{ name: 'rice' }], requirements: {} },
            'nutrition-lab',
        );
        expect(result.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(
            'https://example.test/api/v1/meals/generate',
        );
    });

    it('keeps Ollama on USDA when both providers are configured', async () => {
        vi.stubEnv('USDA_API_KEY', 'usda_test');
        vi.stubEnv('OLLAMA_API_KEY', 'ollama_test');
        vi.stubEnv('OLLAMA_MODEL', 'test-model');
        const meal = {
            mealName: 'Rice bowl',
            instructions: ['Serve.'],
            ingredients: [
                {
                    name: 'rice',
                    weight: 100,
                    caloriesPer100g: 365,
                    proteinPer100g: 7,
                    carbohydratePer100g: 80,
                    fatPer100g: 1,
                },
            ],
        };
        const fetchMock = vi.fn<typeof fetch>(
            async (url) =>
                new Response(
                    JSON.stringify(
                        String(url).startsWith('https://api.nal.usda.gov/')
                            ? {
                                  foods: [
                                      {
                                          fdcId: 169756,
                                          description: 'Rice, raw',
                                          foodNutrients: [],
                                      },
                                  ],
                              }
                            : {
                                  choices: [
                                      {
                                          message: {
                                              content: JSON.stringify(meal),
                                          },
                                      },
                                  ],
                              },
                    ),
                ),
        );
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const result = await handleGenerateMealRequest(
            { ingredients: [{ name: 'rice' }], requirements: {} },
            'ollama',
        );
        expect(result.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            'https://api.nal.usda.gov/',
        );
        expect(fetchMock.mock.calls[1][0]).toBe(
            'https://ollama.com/v1/chat/completions',
        );
    });

    it('maps the API meal and prefers values the user supplied', async () => {
        const fetchMock = vi.fn<typeof fetch>(
            async () =>
                new Response(
                    JSON.stringify({
                        mealName: 'Rice bowl',
                        servings: 1,
                        instructions: ['Rinse the rice.'],
                        ingredients: [
                            {
                                name: 'Rice',
                                weight: 85,
                                caloriesPer100g: 365,
                                proteinPer100g: 7.13,
                                carbohydratePer100g: 79.95,
                                fatPer100g: 0.66,
                                sugarPer100g: null,
                                fiberPer100g: 1.3,
                                micronutrientsPer100g: {
                                    iron: 4.31,
                                    zinc: null,
                                    folate: 231,
                                },
                                usda: { fdcId: 168877, description: 'Rice' },
                            },
                        ],
                    }),
                ),
        );
        vi.stubGlobal('fetch', fetchMock);

        const meal = await generateMealWithNutritionLab({
            ingredients: [{ name: 'rice', caloriesPer100g: 400 }],
            requirements: { calories: 600 },
        });

        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
            ingredients: [{ name: 'rice' }],
            requirements: { calories: 600 },
        });
        expect(meal.ingredients[0]).toMatchObject({
            name: 'Rice',
            weight: 85,
            caloriesPer100g: 400,
            proteinPer100g: 7.13,
            fiberPer100g: 1.3,
            ironPer100g: 4.31,
            folatePer100g: 231,
            nutritionSource: { fdcId: 168877 },
        });
        expect(meal.ingredients[0].sugarPer100g).toBeUndefined();
        expect(meal.ingredients[0].zincPer100g).toBeUndefined();
        expect(meal.ingredients[0].unavailableMicronutrients).toEqual(
            expect.arrayContaining(['zincPer100g', 'seleniumPer100g']),
        );
        expect(meal.ingredients[0].unavailableMicronutrients).not.toContain(
            'ironPer100g',
        );
    });

    it('rejects an invalid API meal', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(
                async () => new Response(JSON.stringify({ mealName: 'x' })),
            ),
        );
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            generateMealWithNutritionLab({
                ingredients: [{ name: 'rice' }],
                requirements: {},
            }),
        ).rejects.toThrow('invalid meal response');
    });

    it('reuses complete matching nutrition and leaves stale or incomplete sources for the API to resolve', async () => {
        const fetchMock = vi.fn<typeof fetch>(
            async () =>
                new Response(
                    JSON.stringify({
                        mealName: 'Rice bowl',
                        instructions: ['Serve.'],
                        ingredients: [
                            {
                                name: 'rice',
                                weight: 100,
                                caloriesPer100g: 365,
                                proteinPer100g: 7,
                                carbohydratePer100g: 80,
                                fatPer100g: 1,
                            },
                        ],
                    }),
                ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const rice = {
            name: 'rice',
            caloriesPer100g: 365,
            proteinPer100g: 7,
            carbohydratePer100g: 80,
            fatPer100g: 0,
            nutritionSource: { fdcId: 169756, description: 'Rice, raw' },
        };

        await generateMealWithNutritionLab({
            ingredients: [
                rice,
                { ...rice, name: 'rice cooked' },
                { ...rice, proteinPer100g: undefined },
                { ...rice, caloriesPer100g: NaN },
                { ...rice, nutritionSource: undefined },
            ],
            requirements: { calories: 600 },
        });

        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(body.ingredients[0]).toEqual({
            name: 'rice',
            match: {
                fdcId: 169756,
                description: 'Rice, raw',
                name: 'rice',
                caloriesPer100g: 365,
                proteinPer100g: 7,
                carbohydratePer100g: 80,
                fatPer100g: 0,
                nutritionSource: 'usda',
            },
        });
        expect(body.ingredients.slice(1)).toEqual([
            { name: 'rice cooked' },
            { name: 'rice' },
            { name: 'rice' },
            { name: 'rice' },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
