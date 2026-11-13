import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { saveMealGenerator } from '../settings/mealGenerator';
import { getIngredientNutrition } from '../services/micronutrientService';
import { useMicronutrientLookup } from './useMicronutrientLookup';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

it('shows cached nutrients immediately without starting another lookup', async () => {
    const fetchMock = vi.fn(
        async () =>
            new Response(
                JSON.stringify({ name: 'Cached spinach', ironPer100g: 2.1 }),
            ),
    );
    vi.stubGlobal('fetch', fetchMock);
    saveMealGenerator('nutrition-lab');
    await getIngredientNutrition('hook-cached-spinach');

    const { result } = renderHook(() =>
        useMicronutrientLookup([{ name: 'hook-cached-spinach' }]),
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data['hook-cached-spinach'].ironPer100g).toBe(2.1);
    expect(fetchMock).toHaveBeenCalledOnce();
});
