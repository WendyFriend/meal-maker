// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { handleIngredientNutrition } from './handleIngredientNutrition.js';
import { getNutritionForIngredients } from './getNutritionForIngredients.js';

vi.mock('./getNutritionForIngredients.js', () => ({
    getNutritionForIngredients: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNutritionForIngredients).mockResolvedValue({
        ingredientsWithNutrition: [],
        unresolvedIngredients: ['rice'],
    });
});

it('looks up the trimmed name with Nutrition Lab', async () => {
    await handleIngredientNutrition({ name: ' rice ' });
    expect(getNutritionForIngredients).toHaveBeenCalledWith([{ name: 'rice' }]);
});

it('rejects a missing name without looking up nutrition', async () => {
    expect((await handleIngredientNutrition({ name: '  ' })).status).toBe(400);
    expect(getNutritionForIngredients).not.toHaveBeenCalled();
});
