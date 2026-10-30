import { afterEach, expect, it, vi } from 'vitest';
import { MICRONUTRIENTS } from '../../shared/micronutrients';
import {
    getIngredientMicronutrients,
    needsMicronutrients,
} from './micronutrientService';
import { saveMealGenerator } from '../settings/mealGenerator';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

it('sends the selected provider and keeps lookup caches separate when switching providers', async () => {
    const fetchMock = vi
        .fn()
        .mockImplementation(
            async () => new Response(JSON.stringify({ ironPer100g: 1 })),
        );
    vi.stubGlobal('fetch', fetchMock);
    saveMealGenerator('ollama');
    await getIngredientMicronutrients('provider-test-rice');
    saveMealGenerator('nutrition-lab');
    await getIngredientMicronutrients('provider-test-rice');
    await getIngredientMicronutrients('provider-test-rice');
    saveMealGenerator('ollama');
    await getIngredientMicronutrients('provider-test-rice');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers['X-Meal-Generator']).toBe(
        'ollama',
    );
    expect(fetchMock.mock.calls[1][1].headers['X-Meal-Generator']).toBe(
        'nutrition-lab',
    );
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
