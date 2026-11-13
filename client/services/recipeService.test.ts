import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    deleteRecipes,
    fillRecipeNutrition,
    updateRecipe,
} from './recipeService';
const db = vi.hoisted(() => ({
    from: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    rpc: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: db }));
beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue(db);
    db.delete.mockReturnValue(db);
    db.update.mockReturnValue(db);
    db.eq.mockReturnValue(db);
    db.in.mockReturnValue(db);
    db.select.mockReturnValue(db);
});
describe('meal update', () => {
    const recipe = {
        id: '1',
        userId: 'user',
        recipeName: 'Tofu bowl',
        ingredients: [],
        instructions: [],
    };

    it('requests only the saved ID and reuses the submitted recipe', async () => {
        db.single.mockResolvedValue({ data: { id: '1' }, error: null });

        expect(await updateRecipe('1', recipe)).toEqual(recipe);
        expect(db.eq).toHaveBeenCalledWith('id', '1');
        expect(db.select).toHaveBeenCalledWith('id');
    });

    it('still reports a failed update', async () => {
        db.single.mockResolvedValue({
            data: null,
            error: new Error('offline'),
        });

        await expect(updateRecipe('1', recipe)).rejects.toThrow('offline');
    });
});
describe('nutrition enrichment', () => {
    it('sends a fill-only update for a saved recipe', async () => {
        db.rpc.mockResolvedValue({ data: [], error: null });
        const enrichment = {
            index: 0,
            name: 'Brown rice',
            nutrients: { ironPer100g: 1.2 },
        };

        await fillRecipeNutrition('recipe-1', [enrichment]);
        expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
            'fill_recipe_nutrition',
            { p_recipe_id: 'recipe-1', p_enrichments: [enrichment] },
        );
    });

    it('skips empty enrichment requests', async () => {
        await fillRecipeNutrition('recipe-1', []);
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it('surfaces database errors', async () => {
        db.rpc.mockResolvedValue({ error: new Error('offline') });
        await expect(
            fillRecipeNutrition('recipe-1', [
                {
                    index: 0,
                    name: 'Brown rice',
                    nutrients: { ironPer100g: 1.2 },
                },
            ]),
        ).rejects.toThrow('offline');
    });
});
describe('bulk meal deletion', () => {
    it('deletes unique IDs in one request and returns only confirmed IDs', async () => {
        db.select.mockResolvedValue({ data: [{ id: '1' }], error: null });
        expect(await deleteRecipes(['1', '2', '1'])).toEqual(['1']);
        expect(db.from).toHaveBeenCalledExactlyOnceWith('recipes');
        expect(db.delete).toHaveBeenCalledOnce();
        expect(db.in).toHaveBeenCalledWith('id', ['1', '2']);
        expect(db.select).toHaveBeenCalledWith('id');
    });
    it('propagates database errors', async () => {
        db.select.mockResolvedValue({
            data: null,
            error: new Error('offline'),
        });
        await expect(deleteRecipes(['1'])).rejects.toThrow('offline');
    });
    it('skips the request when no meals are selected', async () => {
        expect(await deleteRecipes([])).toEqual([]);
        expect(db.from).not.toHaveBeenCalled();
    });
});
