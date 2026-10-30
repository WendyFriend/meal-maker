import { supabase } from '../lib/supabase';
import type {
    JournalEntry,
    JournalEntryInput,
} from '../../shared/types/journal';
import { localDayBounds } from '../journal/nutrition';

type JournalRow = {
    id: string;
    eaten_at: string;
    meal_name: string;
    ingredients: JournalEntry['ingredients'];
};
function toEntry(row: JournalRow): JournalEntry {
    return {
        id: row.id,
        eatenAt: row.eaten_at,
        mealName: row.meal_name,
        ingredients: row.ingredients,
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
    return (data as JournalRow[]).map(toEntry);
}
export async function saveJournalEntry(
    entry: JournalEntryInput,
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
    return toEntry(data as JournalRow);
}

export async function deleteJournalEntry(id: string): Promise<void> {
    const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', id)
        .select('id')
        .single();
    if (error) throw error;
}
