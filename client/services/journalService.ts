import { supabase } from '../lib/supabase';
import type {
    JournalEntry,
    JournalEntryInput,
} from '../../shared/types/journal';
import { localDayBounds } from '../journal/nutrition';
import { notifyJournalChanged } from '../journal/changes';
import { MissingJournalEntryError } from './journalErrors';

type JournalRow = {
    id: string;
    eaten_at: string;
    meal_name: string;
    ingredients: JournalEntry['ingredients'];
    plan_position?: number | null;
};
function toEntry(row: JournalRow): JournalEntry {
    return {
        id: row.id,
        eatenAt: row.eaten_at,
        mealName: row.meal_name,
        ingredients: row.ingredients,
        planPosition: row.plan_position ?? undefined,
    };
}
export async function getJournalEntries(day: string): Promise<JournalEntry[]> {
    const { start, end } = localDayBounds(day);
    const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .gte('eaten_at', start)
        .lt('eaten_at', end)
        .order('eaten_at');
    if (error) throw error;
    return (data as JournalRow[])
        .map(toEntry)
        .sort(
            (a, b) =>
                (a.planPosition ?? Infinity) - (b.planPosition ?? Infinity) ||
                a.eatenAt.localeCompare(b.eatenAt) ||
                a.id.localeCompare(b.id),
        );
}

export async function reorderJournalEntries(
    day: string,
    orderedIds: string[],
): Promise<void> {
    const { start, end } = localDayBounds(day);
    if (new Set(orderedIds).size !== orderedIds.length)
        throw new Error('Each meal can appear only once.');
    const { error } = await supabase.rpc('reorder_journal_entries', {
        p_day_start: start,
        p_day_end: end,
        p_entry_ids: orderedIds,
    });
    if (error) throw error;
}
export async function saveJournalEntry(
    entry: JournalEntryInput,
    source?: symbol,
): Promise<JournalEntry> {
    const timestamp = new Date(entry.eatenAt);
    const ingredients = entry.ingredients.filter(
        (ingredient) => ingredient.weight > 0,
    );
    if (
        !Number.isFinite(timestamp.getTime()) ||
        !entry.mealName.trim() ||
        !ingredients.length ||
        entry.ingredients.some(
            (ingredient) =>
                !ingredient.name.trim() ||
                [
                    ingredient.weight,
                    ingredient.caloriesPer100g,
                    ingredient.proteinPer100g,
                    ingredient.carbohydratePer100g,
                    ingredient.fatPer100g,
                ].some((value) => !Number.isFinite(value) || value < 0),
        )
    ) {
        throw new Error('Choose a valid time and ingredient portions.');
    }
    const { data, error } = await supabase
        .from('journal_entries')
        .insert({
            eaten_at: timestamp.toISOString(),
            meal_name: entry.mealName.trim(),
            ingredients,
        })
        .select()
        .single();
    if (error) throw error;
    notifyJournalChanged(source);
    return toEntry(data as JournalRow);
}

export async function updateJournalEntryIngredients(
    id: string,
    ingredients: JournalEntry['ingredients'],
    source?: symbol,
): Promise<JournalEntry> {
    if (
        !id ||
        !ingredients.length ||
        ingredients.some(
            (ingredient) =>
                !ingredient.name.trim() ||
                [
                    ingredient.weight,
                    ingredient.caloriesPer100g,
                    ingredient.proteinPer100g,
                    ingredient.carbohydratePer100g,
                    ingredient.fatPer100g,
                ].some((value) => !Number.isFinite(value) || value < 0),
        )
    )
        throw new Error('Add at least one ingredient with valid portions.');
    const { data, error } = await supabase
        .from('journal_entries')
        .update({ ingredients })
        .eq('id', id)
        .select()
        // No row means the meal was deleted elsewhere; report that plainly
        // instead of a 406 from `.single()`.
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new MissingJournalEntryError();
    notifyJournalChanged(source);
    return toEntry(data as JournalRow);
}

/** Renames a plan meal; its ingredients are unchanged. */
export async function updateJournalEntryName(
    id: string,
    mealName: string,
    source?: symbol,
): Promise<JournalEntry> {
    const name = mealName.trim();
    if (!id || !name) throw new Error('Enter a meal name.');
    const { data, error } = await supabase
        .from('journal_entries')
        .update({ meal_name: name })
        .eq('id', id)
        .select()
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new MissingJournalEntryError();
    notifyJournalChanged(source);
    return toEntry(data as JournalRow);
}

export async function deleteJournalEntry(
    id: string,
    source?: symbol,
): Promise<void> {
    const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', id)
        // Already gone (e.g. deleted on another device) counts as removed.
        .select('id')
        .maybeSingle();
    if (error) throw error;
    notifyJournalChanged(source);
}
