import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchNutrition } from './nutritionService';
import {
    toUserIngredient,
    toUserIngredientValues,
    type UserIngredientRow,
} from './ingredientService';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

const row: UserIngredientRow = {
    id: 'a1',
    user_id: 'u1',
    name: 'Rice',
    calories_per_100g: 130,
    protein_per_100g: 2.7,
    carbohydrate_per_100g: 28,
    fat_per_100g: 0.3,
    sugar_per_100g: null,
    saturated_fat_per_100g: null,
    fiber_per_100g: null,
    quantity: 500,
    unit: 'g',
    expires_on: '2026-11-01',
    created_at: '',
    updated_at: '',
};

describe('ingredientService pantry mapping', () => {
    it('maps pantry columns onto UserIngredient', () => {
        expect(toUserIngredient(row)).toMatchObject({
            quantity: 500,
            unit: 'g',
            expiresOn: '2026-11-01',
        });
    });

    it('leaves pantry fields undefined for rows without them', () => {
        const ingredient = toUserIngredient({
            ...row,
            quantity: null,
            unit: null,
            expires_on: null,
        });
        expect(ingredient.quantity).toBeUndefined();
        expect(ingredient.unit).toBeUndefined();
        expect(ingredient.expiresOn).toBeUndefined();
    });

    it('writes pantry values, and null when cleared', () => {
        expect(
            toUserIngredientValues({
                name: 'Rice',
                caloriesPer100g: 130,
                proteinPer100g: 2.7,
                quantity: 500,
                unit: 'g',
                expiresOn: '2026-11-01',
            }),
        ).toMatchObject({ quantity: 500, unit: 'g', expires_on: '2026-11-01' });
        expect(
            toUserIngredientValues({
                name: 'Rice',
                caloriesPer100g: 130,
                proteinPer100g: 2.7,
            }),
        ).toMatchObject({ quantity: null, unit: null, expires_on: null });
    });
});

describe('searchNutrition', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('requests the encoded query and returns results', async () => {
        const fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({ results: [{ name: 'Rice' }] }),
        }));
        vi.stubGlobal('fetch', fetch);
        const signal = new AbortController().signal;
        await expect(searchNutrition(' brown rice ', signal)).resolves.toEqual([
            { name: 'Rice' },
        ]);
        expect(fetch).toHaveBeenCalledWith('/api/nutrition?q=brown%20rice', {
            signal,
        });
    });

    it('throws on a non-OK response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 502 })),
        );
        await expect(searchNutrition('rice')).rejects.toThrow(/502/);
    });
});
