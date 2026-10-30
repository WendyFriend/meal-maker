// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import {
    handleFoodSuggestions,
    handleParseIngredients,
} from './handleFoodSearch.js';
import { parseIngredientText, searchFoods } from './mealmaker/client.js';

vi.mock('./mealmaker/client.js', () => ({
    searchFoods: vi.fn(),
    parseIngredientText: vi.fn(),
}));

const food = (description: string, name?: string) => ({
    fdcId: 1,
    description,
    name,
    match: { tier: 'confident' as const },
    per100g: {
        kcal: 172,
        proteinG: null,
        carbsG: null,
        fatG: null,
        sugarG: null,
        fibreG: null,
        satFatG: null,
    },
});

beforeEach(() => vi.clearAllMocks());

it('uses the short name, falling back to the description', async () => {
    vi.mocked(searchFoods).mockResolvedValue({
        query: 'chick',
        results: [
            food('Chicken, broilers or fryers, breast, raw', 'Chicken, breast'),
            food('Chicken spread'),
        ],
    });
    const result = await handleFoodSuggestions(' chick ');
    expect(searchFoods).toHaveBeenCalledWith('chick', 8);
    expect(result).toMatchObject({
        status: 200,
        body: {
            results: [
                { name: 'Chicken, breast', caloriesPer100g: 172 },
                { name: 'Chicken spread' },
            ],
        },
    });
});

it('rejects short queries without calling the API', async () => {
    expect((await handleFoodSuggestions('c')).status).toBe(400);
    expect(searchFoods).not.toHaveBeenCalled();
});

it("returns each parsed food's proper name, else the words typed", async () => {
    vi.mocked(parseIngredientText).mockResolvedValue({
        ingredients: [
            {
                said: 'chicken brest',
                name: 'Chicken, breast',
                match: { fdcId: 1, description: 'Chicken, breast, raw' },
            },
            { said: ' mystery spice ', match: null },
        ],
    });
    const result = await handleParseIngredients({
        text: 'chicken brest and mystery spice',
    });
    expect(result).toEqual({
        status: 200,
        body: { ingredients: ['Chicken, breast', 'mystery spice'] },
    });
});

it('reports an unavailable API as a bad gateway', async () => {
    vi.mocked(parseIngredientText).mockRejectedValue(new Error('down'));
    expect(
        (await handleParseIngredients({ text: 'eggs and toast' })).status,
    ).toBe(502);
});
