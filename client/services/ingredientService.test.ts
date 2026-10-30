import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    updateUserIngredient,
    type UserIngredientRow,
} from './ingredientService';
import type { UserIngredient } from '../../shared/types/types';

const db = vi.hoisted(() => ({
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => db } }));

const ingredient: UserIngredient = {
    ingredientId: 'tofu',
    name: 'Tofu',
    caloriesPer100g: 130,
    proteinPer100g: 15,
    fatPer100g: 4,
    carbohydratePer100g: 5.6,
};
const row: UserIngredientRow = {
    id: 'tofu',
    user_id: 'user',
    name: 'Tofu',
    calories_per_100g: 130,
    protein_per_100g: 15,
    fat_per_100g: 4,
    carbohydrate_per_100g: 5.6,
    sugar_per_100g: null,
    saturated_fat_per_100g: null,
    fiber_per_100g: null,
    created_at: '',
    updated_at: '',
};

beforeEach(() => {
    vi.clearAllMocks();
    db.update.mockReturnValue(db);
    db.eq.mockReturnValue(db);
    db.select.mockReturnValue(db);
});

describe('saved ingredient micronutrients', () => {
    it('writes edited values and reads them back, including genuine zeros', async () => {
        const micronutrients = { ironPer100g: 9, vitaminB12Per100g: 0 };
        db.single.mockResolvedValue({
            data: { ...row, micronutrients },
            error: null,
        });
        const saved = await updateUserIngredient('tofu', {
            ...ingredient,
            ...micronutrients,
        });
        expect(db.update).toHaveBeenCalledWith(
            expect.objectContaining({ micronutrients }),
        );
        expect(saved).toMatchObject(micronutrients);
        expect(saved.calciumPer100g).toBeUndefined();
    });

    it('removes cleared overrides without storing zero for missing values', async () => {
        db.single.mockResolvedValue({
            data: { ...row, micronutrients: {} },
            error: null,
        });
        const saved = await updateUserIngredient('tofu', {
            ...ingredient,
            ironPer100g: undefined,
        });
        expect(db.update).toHaveBeenCalledWith(
            expect.objectContaining({ micronutrients: {} }),
        );
        expect(saved.ironPer100g).toBeUndefined();
    });

    it('leaves micronutrients untouched when only existing macro fields are supplied', async () => {
        db.single.mockResolvedValue({ data: row, error: null });
        await updateUserIngredient('tofu', ingredient);
        expect(db.update.mock.calls[0][0]).not.toHaveProperty('micronutrients');
    });
});
