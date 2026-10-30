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

it.each([
    [undefined, 'usda'],
    ['ollama', 'usda'],
    ['nutrition-lab', 'nutrition-lab'],
] as const)(
    'routes ingredient lookups for %s to %s',
    async (header, provider) => {
        await handleIngredientNutrition({ name: ' rice ' }, header);
        expect(getNutritionForIngredients).toHaveBeenCalledWith(
            [{ name: 'rice' }],
            provider,
        );
    },
);

it('rejects an unknown provider without looking up nutrition', async () => {
    const result = await handleIngredientNutrition({ name: 'rice' }, 'unknown');
    expect(result.status).toBe(400);
    expect(getNutritionForIngredients).not.toHaveBeenCalled();
});
