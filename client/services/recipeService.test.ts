import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteRecipes } from './recipeService';
const db = vi.hoisted(() => ({
    from: vi.fn(),
    delete: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: db }));
beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue(db);
    db.delete.mockReturnValue(db);
    db.in.mockReturnValue(db);
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
