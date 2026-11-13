import { afterEach, expect, it, vi } from 'vitest';
import { MICRONUTRIENTS } from '../../shared/micronutrients';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
    needsMicronutrients,
} from './micronutrientService';
import { saveMealGenerator } from '../settings/mealGenerator';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

it('sends the selected provider and keeps lookup caches separate when switching providers', async () => {
    const fetchMock = vi.fn().mockImplementation(
        async () =>
            new Response(
                JSON.stringify({
                    name: 'Rice',
                    caloriesPer100g: 365,
                    proteinPer100g: 7.1,
                    carbohydratePer100g: 80,
                    fatPer100g: 0.7,
                    ironPer100g: 1,
                }),
            ),
    );
    vi.stubGlobal('fetch', fetchMock);
    saveMealGenerator('ollama');
    await getIngredientNutrition('provider-test-rice');
    saveMealGenerator('nutrition-lab');
    await getIngredientNutrition('provider-test-rice');
    await getIngredientNutrition('provider-test-rice');
    saveMealGenerator('ollama');
    await getIngredientNutrition('provider-test-rice');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers['X-Meal-Generator']).toBe(
        'ollama',
    );
    expect(fetchMock.mock.calls[1][1].headers['X-Meal-Generator']).toBe(
        'nutrition-lab',
    );
});

it('keeps macro and micronutrient values returned by the lookup', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        name: 'Pumpkin, raw',
                        caloriesPer100g: 26,
                        proteinPer100g: 1,
                        carbohydratePer100g: 6.5,
                        fatPer100g: 0.1,
                        ironPer100g: 0.8,
                    }),
                ),
        ),
    );
    saveMealGenerator('nutrition-lab');

    await expect(
        getIngredientNutrition('full-lookup-pumpkin'),
    ).resolves.toMatchObject({
        name: 'Pumpkin, raw',
        caloriesPer100g: 26,
        carbohydratePer100g: 6.5,
        ironPer100g: 0.8,
    });
});

it('reuses successful nutrient lookups after an app reload', async () => {
    const fetchMock = vi.fn(
        async () =>
            new Response(
                JSON.stringify({
                    name: 'Persisted rice',
                    ironPer100g: 1.2,
                }),
            ),
    );
    vi.stubGlobal('fetch', fetchMock);
    saveMealGenerator('nutrition-lab');
    await getIngredientNutrition('persisted-rice');
    expect(getCachedIngredientNutrition('persisted-rice')).toMatchObject({
        ironPer100g: 1.2,
    });

    vi.resetModules();
    const reloaded = await import('./micronutrientService');
    expect(
        reloaded.getCachedIngredientNutrition('persisted-rice'),
    ).toMatchObject({
        ironPer100g: 1.2,
    });
    await reloaded.getIngredientNutrition('persisted-rice');
    expect(fetchMock).toHaveBeenCalledOnce();
});

const allKeys = MICRONUTRIENTS.map(({ key }) => key);

it('asks for a lookup when a micronutrient is missing and not marked unavailable', () => {
    expect(needsMicronutrients({ ironPer100g: 1 })).toBe(true);
});

it('skips the lookup when every missing micronutrient is marked unavailable', () => {
    expect(
        needsMicronutrients({
            ironPer100g: 1,
            unavailableMicronutrients: allKeys.filter(
                (key) => key !== 'ironPer100g',
            ),
        }),
    ).toBe(false);
});

it('still asks for a lookup when only some missing values are marked unavailable', () => {
    expect(
        needsMicronutrients({ unavailableMicronutrients: ['seleniumPer100g'] }),
    ).toBe(true);
});
