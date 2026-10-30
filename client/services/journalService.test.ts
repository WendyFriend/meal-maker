import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getJournalEntries,
    saveJournalEntry,
    deleteJournalEntry,
} from './journalService';
import { localDayBounds } from '../journal/nutrition';
const db = vi.hoisted(() => ({
    from: vi.fn(),
    select: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: db }));
const ingredients = [
    {
        name: 'Tofu',
        weight: 150,
        caloriesPer100g: 130,
        proteinPer100g: 15,
        carbohydratePer100g: 6,
        fatPer100g: 4,
        vitaminB12Per100g: 0,
    },
];
beforeEach(() => {
    vi.clearAllMocks();
    for (const method of [
        'from',
        'select',
        'gte',
        'lt',
        'insert',
        'delete',
        'eq',
    ] as const)
        db[method].mockReturnValue(db);
});
describe('journal persistence', () => {
    it('queries a local day as an inclusive start and exclusive next midnight', async () => {
        db.order.mockResolvedValue({ data: [], error: null });
        await getJournalEntries('2026-10-29');
        const { start, end } = localDayBounds('2026-10-29');
        expect(db.from).toHaveBeenCalledWith('journal_entries');
        expect(db.gte).toHaveBeenCalledWith('eaten_at', start);
        expect(db.lt).toHaveBeenCalledWith('eaten_at', end);
    });
    it('stores a timestamp and nutrition snapshot without attaching a saved recipe or overwriting missing values', async () => {
        const eatenAt = '2026-10-29T10:30:00+11:00';
        db.single.mockResolvedValue({
            data: {
                id: 'entry-1',
                eaten_at: new Date(eatenAt).toISOString(),
                meal_name: 'Tofu bowl',
                ingredients,
            },
            error: null,
        });
        const saved = await saveJournalEntry({
            mealName: 'Tofu bowl',
            eatenAt,
            ingredients,
        });
        expect(db.insert).toHaveBeenCalledWith({
            meal_name: 'Tofu bowl',
            eaten_at: new Date(eatenAt).toISOString(),
            ingredients,
        });
        expect(saved.ingredients[0].vitaminB12Per100g).toBe(0);
        expect(saved.ingredients[0].ironPer100g).toBeUndefined();
    });
    it('rejects invalid portions before making a request and propagates storage failures', async () => {
        await expect(
            saveJournalEntry({
                mealName: 'Tofu',
                eatenAt: new Date().toISOString(),
                ingredients: [{ ...ingredients[0], weight: -1 }],
            }),
        ).rejects.toThrow();
        expect(db.insert).not.toHaveBeenCalled();
        db.single.mockResolvedValue({
            data: null,
            error: new Error('offline'),
        });
        await expect(
            saveJournalEntry({
                mealName: 'Tofu',
                eatenAt: new Date().toISOString(),
                ingredients,
            }),
        ).rejects.toThrow('offline');
    });
    it('removes only the selected journal entry and propagates deletion failures', async () => {
        db.single.mockResolvedValueOnce({
            data: { id: 'entry-1' },
            error: null,
        });
        await deleteJournalEntry('entry-1');
        expect(db.from).toHaveBeenCalledWith('journal_entries');
        expect(db.delete).toHaveBeenCalledOnce();
        expect(db.eq).toHaveBeenCalledWith('id', 'entry-1');
        db.single.mockResolvedValueOnce({
            data: null,
            error: new Error('offline'),
        });
        await expect(deleteJournalEntry('entry-1')).rejects.toThrow('offline');
    });
});
