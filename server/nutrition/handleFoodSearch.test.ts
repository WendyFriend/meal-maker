// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { handleFoodSearch } from './handleFoodSearch.js';
import { searchNutritionLabFoods } from './mealmaker/client.js';

vi.mock('./mealmaker/client.js', () => ({
    searchNutritionLabFoods: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it('returns ranked Nutrition Lab foods for a typed query', async () => {
    vi.mocked(searchNutritionLabFoods).mockResolvedValue({
        query: 'broc',
        results: [
            {
                fdcId: 170379,
                name: 'Broccoli',
                description: 'Broccoli, raw',
                match: { tier: 'confident' },
                per100g: {
                    kcal: 34,
                    proteinG: 2.8,
                    carbsG: 6.6,
                    fatG: 0.4,
                    sugarG: 1.7,
                    fibreG: 2.6,
                    satFatG: 0.04,
                },
            },
        ],
    });
    const result = await handleFoodSearch(' broc ');
    expect(searchNutritionLabFoods).toHaveBeenCalledWith('broc', 12);
    expect(result).toMatchObject({
        status: 200,
        body: { results: [{ fdcId: 170379, name: 'Broccoli' }] },
    });
});

it('rejects short searches', async () => {
    expect((await handleFoodSearch('b')).status).toBe(400);
    expect(searchNutritionLabFoods).not.toHaveBeenCalled();
});
