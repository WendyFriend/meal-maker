import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getJournalEntries,
    saveJournalEntry,
    deleteJournalEntry,
    reorderJournalEntries,
    updateJournalEntryIngredients,
} from './journalService';
import { localDayBounds } from '../journal/nutrition';
import { subscribeJournalChanges } from '../journal/changes';
const db = vi.hoisted(() => ({
    from: vi.fn(),
    select: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    rpc: vi.fn(),
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
        'update',
        'delete',
        'eq',
    ] as const)
        db[method].mockReturnValue(db);
    db.rpc.mockResolvedValue({ error: null });
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
    it('uses saved plan positions without changing logged times', async () => {
        db.order.mockResolvedValue({
            data: [
                {
                    id: 'one',
                    eaten_at: '2026-10-29T08:00:00Z',
                    meal_name: 'First logged',
                    ingredients,
                    plan_position: 2,
                },
                {
                    id: 'two',
                    eaten_at: '2026-10-29T09:00:00Z',
                    meal_name: 'Second logged',
                    ingredients,
                    plan_position: 1,
                },
                {
                    id: 'three',
                    eaten_at: '2026-10-29T10:00:00Z',
                    meal_name: 'New meal',
                    ingredients,
                    plan_position: null,
                },
            ],
            error: null,
        });
        const entries = await getJournalEntries('2026-10-29');
        expect(entries.map(({ id }) => id)).toEqual(['two', 'one', 'three']);
        expect(entries[0].eatenAt).toBe('2026-10-29T09:00:00Z');
    });
    it('saves the full day order in one request', async () => {
        await reorderJournalEntries('2026-10-29', ['two', 'one']);
        const { start, end } = localDayBounds('2026-10-29');
        expect(db.rpc).toHaveBeenCalledWith('reorder_journal_entries', {
            p_day_start: start,
            p_day_end: end,
            p_entry_ids: ['two', 'one'],
        });
        await expect(
            reorderJournalEntries('2026-10-29', ['one', 'one']),
        ).rejects.toThrow('Each meal can appear only once.');
        expect(db.rpc).toHaveBeenCalledOnce();
        db.rpc.mockResolvedValueOnce({ error: new Error('offline') });
        await expect(
            reorderJournalEntries('2026-10-29', ['two', 'one']),
        ).rejects.toThrow('offline');
    });
    it('stores a timestamp and nutrition snapshot without attaching a saved recipe or overwriting missing values', async () => {
        const changed = vi.fn();
        const unsubscribe = subscribeJournalChanges(changed);
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
        expect(changed).toHaveBeenCalledOnce();
        unsubscribe();
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
        const changed = vi.fn();
        const unsubscribe = subscribeJournalChanges(changed);
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
        expect(changed).toHaveBeenCalledOnce();
        unsubscribe();
    });
    it('updates only one journal ingredient snapshot and announces the change', async () => {
        const changed = vi.fn();
        const unsubscribe = subscribeJournalChanges(changed);
        db.single.mockResolvedValueOnce({
            data: {
                id: 'entry-1',
                eaten_at: '2026-10-29T08:00:00Z',
                meal_name: 'Tofu bowl',
                ingredients,
            },
            error: null,
        });
        const saved = await updateJournalEntryIngredients(
            'entry-1',
            ingredients,
        );
        expect(db.update).toHaveBeenCalledWith({ ingredients });
        expect(db.eq).toHaveBeenCalledWith('id', 'entry-1');
        expect(saved.ingredients).toEqual(ingredients);
        expect(changed).toHaveBeenCalledOnce();
        unsubscribe();
    });
    it('rejects invalid journal ingredient edits and preserves storage errors', async () => {
        await expect(
            updateJournalEntryIngredients('entry-1', []),
        ).rejects.toThrow('Add at least one ingredient');
        expect(db.update).not.toHaveBeenCalled();
        db.single.mockResolvedValueOnce({
            data: null,
            error: new Error('offline'),
        });
        await expect(
            updateJournalEntryIngredients('entry-1', ingredients),
        ).rejects.toThrow('offline');
    });
});
