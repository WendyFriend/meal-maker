// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handleGenerateMealRequest,
    parseMealGenerator,
} from './handleGenerateMealRequest.js';
import { MICRONUTRIENTS } from '../../shared/micronutrients.js';
import type { UserIngredient } from '../../shared/types/types.js';
import { generateMealWithNutritionLab } from './algorithms/generateMealNutritionLab.js';

describe('parseMealGenerator', () => {
    it('defaults to Nutrition Lab, accepts known values and rejects others', () => {
        expect(parseMealGenerator(undefined)).toBe('nutrition-lab');
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

    it('resolves foods first, then sends their nutrition to Nutrition Lab generation', async () => {
        const fetchMock = vi.fn<typeof fetch>(async (url) => {
            const path = String(url).replace('https://example.test/api/v1', '');
            if (path === '/parse')
                return new Response(
                    JSON.stringify({
                        ingredients: [{ said: 'rice', match: null }],
                    }),
                );
            if (path === '/foods/resolve')
                return new Response(
                    JSON.stringify({
                        results: [
                            {
                                term: 'rice',
                                food: {
                                    fdcId: 169756,
                                    description: 'Rice, white, raw',
                                    match: { tier: 'confident' },
                                    per100g: {
                                        kcal: 365,
                                        proteinG: 7,
                                        carbsG: 80,
                                        fatG: 1,
                                    },
                                },
                            },
                        ],
                    }),
                );
            if (path === '/foods/169756')
                return new Response(
                    JSON.stringify({
                        fdcId: 169756,
                        description: 'Rice, white, raw',
                        nutrientsPer100g: [
                            {
                                nbr: '303',
                                name: 'Iron',
                                unit: 'MG',
                                amount: 0.8,
                            },
                        ],
                    }),
                );
            return new Response(
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
            );
        });
        vi.stubGlobal('fetch', fetchMock);
        const result = await handleGenerateMealRequest(
            { ingredients: [{ name: 'rice' }], requirements: {} },
            'nutrition-lab',
        );
        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            ingredients: [{ thumbnailSource: 'nutrition-lab' }],
        });
        expect(result.serverTiming).toMatch(/nutrition_lab;dur=\d+\.\d/);
        expect(result.serverTiming).toMatch(/generation;dur=\d+\.\d/);
        const generateCall = fetchMock.mock.calls.find(([url]) =>
            String(url).endsWith('/meals/generate'),
        )!;
        expect(JSON.parse(String(generateCall[1]?.body)).ingredients).toEqual([
            expect.objectContaining({
                name: 'rice',
                caloriesPer100g: 365,
                micronutrientsPer100g: { iron: 0.8 },
            }),
        ]);
        expect(
            fetchMock.mock.calls.every(([url]) =>
                String(url).startsWith('https://example.test/api/v1/'),
            ),
        ).toBe(true);
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
        expect(result.serverTiming).toMatch(/usda;dur=\d+\.\d/);
        expect(result.body).toMatchObject({
            ingredients: [{ thumbnailSource: 'local' }],
        });
        expect(result.serverTiming).toMatch(/ollama;dur=\d+\.\d/);
        expect(result.serverTiming).toMatch(/generation;dur=\d+\.\d/);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            'https://api.nal.usda.gov/',
        );
        expect(fetchMock.mock.calls[1][0]).toBe(
            'https://ollama.com/v1/chat/completions',
        );
    });

    it('sends saved macros directly without a food id and maps the returned nutrition', async () => {
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
                                caloriesPer100g: 400,
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
            ingredients: [
                {
                    name: 'rice',
                    caloriesPer100g: 400,
                    proteinPer100g: 7.13,
                    carbohydratePer100g: 79.95,
                    fatPer100g: 0.66,
                },
            ],
            requirements: { calories: 600 },
        });

        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
            ingredients: [
                {
                    name: 'rice',
                    caloriesPer100g: 400,
                    proteinPer100g: 7.13,
                    carbohydratePer100g: 79.95,
                    fatPer100g: 0.66,
                },
            ],
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

    it('forwards valid direct macros and partial micronutrients, including zeros', async () => {
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
                                fatPer100g: 0,
                                micronutrientsPer100g: {
                                    iron: 1.23,
                                    vitaminC: 0,
                                    calcium: 21,
                                },
                                usda: {
                                    fdcId: 168448,
                                    description: 'NL reference',
                                },
                            },
                        ],
                    }),
                ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const meal = await generateMealWithNutritionLab({
            ingredients: [
                {
                    name: 'rice',
                    caloriesPer100g: 365,
                    proteinPer100g: 7,
                    carbohydratePer100g: 80,
                    fatPer100g: 0,
                    sugarPer100g: 0,
                    saturatedFatPer100g: NaN,
                    fiberPer100g: -1,
                    ironPer100g: 1.23,
                    vitaminCPer100g: 0,
                    calciumPer100g: Infinity,
                    nutritionSource: {
                        fdcId: 169756,
                        description: 'Rice, raw',
                    },
                },
            ],
            requirements: { calories: 600 },
        });
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(body.ingredients).toEqual([
            {
                name: 'rice',
                caloriesPer100g: 365,
                proteinPer100g: 7,
                carbohydratePer100g: 80,
                fatPer100g: 0,
                sugarPer100g: 0,
                micronutrientsPer100g: { iron: 1.23, vitaminC: 0 },
            },
        ]);
        expect(meal.ingredients[0].ironPer100g).toBe(1.23);
        expect(meal.ingredients[0].vitaminCPer100g).toBe(0);
        expect(meal.ingredients[0].calciumPer100g).toBe(21);
        expect(meal.ingredients[0].nutritionSource?.fdcId).toBe(169756);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('uses returned macros for consistency with generated portions', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(
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
            ),
        );
        const meal = await generateMealWithNutritionLab({
            ingredients: [{ name: 'rice', caloriesPer100g: 400 }],
            requirements: {},
        });
        expect(meal.ingredients[0].caloriesPer100g).toBe(365);
    });
    it('keeps explicit unknown micronutrients unavailable while preserving supplied zeros', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(
                async () =>
                    new Response(
                        JSON.stringify({
                            mealName: 'Unmatched food',
                            instructions: ['Serve.'],
                            ingredients: [
                                {
                                    name: 'Unknown ingredient',
                                    weight: 100,
                                    caloriesPer100g: 100,
                                    proteinPer100g: 5,
                                    carbohydratePer100g: 15,
                                    fatPer100g: 2,
                                    micronutrientsPer100g: Object.fromEntries(
                                        MICRONUTRIENTS.map(({ key }) => [
                                            key.replace('Per100g', ''),
                                            null,
                                        ]),
                                    ),
                                },
                            ],
                        }),
                    ),
            ),
        );
        const meal = await generateMealWithNutritionLab({
            ingredients: [{ name: 'Unknown ingredient', ironPer100g: 0 }],
            requirements: {},
        });
        expect(meal.ingredients[0].ironPer100g).toBe(0);
        expect(meal.ingredients[0].calciumPer100g).toBeUndefined();
        expect(meal.ingredients[0].unavailableMicronutrients).toEqual(
            MICRONUTRIENTS.filter(({ key }) => key !== 'ironPer100g').map(
                ({ key }) => key,
            ),
        );
    });

    it('splits typed text into separate foods only when generating', async () => {
        const calls: string[] = [];
        const sent: unknown[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(async (url, init) => {
                const path = String(url).replace(
                    'https://example.test/api/v1',
                    '',
                );
                calls.push(path);
                if (path === '/parse')
                    return new Response(
                        JSON.stringify({
                            ingredients: [
                                { said: 'chicken', name: 'Chicken, breast' },
                                { said: 'rice', name: 'Rice, white' },
                            ],
                        }),
                    );
                if (path === '/foods/resolve') {
                    const [term] = JSON.parse(String(init?.body)).terms;
                    return new Response(
                        JSON.stringify({
                            results: [
                                {
                                    term,
                                    food: {
                                        fdcId: term.length,
                                        description: term,
                                        match: { tier: 'confident' },
                                        per100g: {
                                            kcal: 100,
                                            proteinG: 5,
                                            carbsG: 10,
                                            fatG: 1,
                                        },
                                    },
                                },
                            ],
                        }),
                    );
                }
                if (path.startsWith('/foods/'))
                    return new Response(
                        JSON.stringify({ nutrientsPer100g: [] }),
                    );
                sent.push(JSON.parse(String(init?.body)));
                return new Response(
                    JSON.stringify({
                        mealName: 'Chicken and rice',
                        instructions: ['Serve.'],
                        ingredients: [
                            {
                                name: 'Chicken, breast',
                                weight: 100,
                                caloriesPer100g: 100,
                                proteinPer100g: 5,
                                carbohydratePer100g: 10,
                                fatPer100g: 1,
                            },
                        ],
                    }),
                );
            }),
        );

        const savedOats: UserIngredient = {
            name: 'Saved oats',
            ingredientId: 'saved-1',
            caloriesPer100g: 389,
            proteinPer100g: 17,
            carbohydratePer100g: 66,
            fatPer100g: 7,
        };
        await handleGenerateMealRequest(
            {
                ingredients: [{ name: 'chicken and rice' }, savedOats],
                requirements: {},
            },
            'nutrition-lab',
        );

        expect(calls.filter((path) => path === '/parse')).toHaveLength(1);
        expect(
            (sent[0] as { ingredients: { name: string }[] }).ingredients.map(
                ({ name }) => name,
            ),
        ).toEqual(['Chicken, breast', 'Rice, white', 'Saved oats']);
    });

    it('uses prefetched nutrition as sent, with no parse or lookup for it', async () => {
        const paths: string[] = [];
        const sent: {
            ingredients: { name: string; caloriesPer100g?: number }[];
        }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(async (url, init) => {
                const path = String(url).replace(
                    'https://example.test/api/v1',
                    '',
                );
                paths.push(path);
                if (path === '/parse')
                    return new Response(
                        JSON.stringify({
                            ingredients: [{ said: 'kale', name: 'Kale, raw' }],
                        }),
                    );
                if (path === '/foods/resolve') {
                    const [term] = JSON.parse(String(init?.body)).terms;
                    return new Response(
                        JSON.stringify({
                            results: [
                                {
                                    term,
                                    food: {
                                        fdcId: 168421,
                                        description: 'Kale, raw',
                                        match: { tier: 'confident' },
                                        per100g: {
                                            kcal: 35,
                                            proteinG: 3,
                                            carbsG: 4,
                                            fatG: 1.5,
                                        },
                                    },
                                },
                            ],
                        }),
                    );
                }
                if (path.startsWith('/foods/'))
                    return new Response(
                        JSON.stringify({ nutrientsPer100g: [] }),
                    );
                sent.push(JSON.parse(String(init?.body)));
                return new Response(
                    JSON.stringify({
                        mealName: 'Bowl',
                        instructions: ['Serve.'],
                        ingredients: [
                            {
                                name: 'tomato',
                                weight: 100,
                                caloriesPer100g: 18,
                                proteinPer100g: 1,
                                carbohydratePer100g: 4,
                                fatPer100g: 0.2,
                            },
                        ],
                    }),
                );
            }),
        );

        await handleGenerateMealRequest(
            {
                ingredients: [
                    {
                        name: 'tomato',
                        caloriesPer100g: 18,
                        proteinPer100g: 1,
                        carbohydratePer100g: 4,
                        fatPer100g: 0.2,
                    },
                    { name: 'kale' },
                ],
                requirements: {},
            },
            'nutrition-lab',
        );

        // Only the ingredient without nutrition is parsed and looked up.
        expect(paths.filter((path) => path === '/parse')).toHaveLength(1);
        expect(paths.filter((path) => path === '/foods/resolve')).toHaveLength(
            1,
        );
        expect(sent[0].ingredients).toEqual([
            expect.objectContaining({ name: 'tomato', caloriesPer100g: 18 }),
            expect.objectContaining({ name: 'Kale, raw', caloriesPer100g: 35 }),
        ]);
    });

    it('returns the lookup name as resolvedName while the ingredient keeps its typed name', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(
                async () =>
                    new Response(
                        JSON.stringify({
                            mealName: 'Oats',
                            instructions: ['Serve.'],
                            ingredients: [
                                {
                                    name: 'rolled oats',
                                    weight: 80,
                                    caloriesPer100g: 389,
                                    proteinPer100g: 17,
                                    carbohydratePer100g: 66,
                                    fatPer100g: 7,
                                },
                            ],
                        }),
                    ),
            ),
        );

        const meal = await generateMealWithNutritionLab({
            ingredients: [
                {
                    name: 'rolled oats',
                    resolvedName: 'Rolled oats, dry',
                    caloriesPer100g: 389,
                    proteinPer100g: 17,
                    carbohydratePer100g: 66,
                    fatPer100g: 7,
                },
            ],
            requirements: {},
        });

        expect(meal.ingredients[0]).toMatchObject({
            name: 'rolled oats',
            resolvedName: 'Rolled oats, dry',
        });
    });
});
