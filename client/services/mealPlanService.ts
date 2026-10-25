import { supabase } from '../lib/supabase';
import { devTable } from '../lib/devStore';
import { isDevSessionActive } from '../auth/devAuth';
import type {
    MealPlanEntry,
    MealPlanSlot,
    Recipe,
} from '../../shared/types/recipe';

export type MealPlanEntryRow = {
    id: string;
    user_id: string;
    plan_date: string;
    slot: MealPlanSlot;
    recipe_id: string;
    created_at: string;
    updated_at: string;
};

export const MEAL_PLAN_SLOTS: MealPlanSlot[] = [
    'breakfast',
    'lunch',
    'dinner',
    'snack',
];

const devEntries = devTable<MealPlanEntryRow>('meal_plan_entries');

/* Local-time YYYY-MM-DD, so "today" matches the user's calendar. */
export function toDateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/* Monday of the week containing `date`, at local midnight. */
export function startOfWeek(date: Date): Date {
    const daysSinceMonday = (date.getDay() + 6) % 7;

    return addDays(date, -daysSinceMonday);
}

/* The seven days Monday-Sunday starting at `weekStart`. */
export function getWeekDates(weekStart: Date): Date[] {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export async function getEntriesForRange(start: string, end: string) {
    if (isDevSessionActive()) {
        return devEntries
            .list()
            .filter((row) => row.plan_date >= start && row.plan_date <= end)
            .map(toMealPlanEntry);
    }

    const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('*')
        .gte('plan_date', start)
        .lte('plan_date', end)
        .order('plan_date');

    if (error) {
        throw error;
    }

    return (data as MealPlanEntryRow[]).map(toMealPlanEntry);
}

export async function addEntry(
    planDate: string,
    slot: MealPlanSlot,
    recipeId: string,
) {
    const values = { plan_date: planDate, slot, recipe_id: recipeId };

    if (isDevSessionActive()) {
        return toMealPlanEntry(devEntries.insert(values));
    }

    const { data, error } = await supabase
        .from('meal_plan_entries')
        .insert(values)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toMealPlanEntry(data as MealPlanEntryRow);
}

export async function removeEntry(id: string) {
    if (isDevSessionActive()) {
        devEntries.remove(id);
        return;
    }

    const { error } = await supabase
        .from('meal_plan_entries')
        .delete()
        .eq('id', id);

    if (error) {
        throw error;
    }
}

/* Calories in one serving; calories are stored per 100g of each ingredient. */
export function getRecipeCalories(recipe: Recipe): number {
    return recipe.ingredients.reduce(
        (total, ingredient) =>
            total + (ingredient.caloriesPer100g * ingredient.weight) / 100,
        0,
    );
}

export function toMealPlanEntry(row: MealPlanEntryRow): MealPlanEntry {
    return {
        id: row.id,
        planDate: row.plan_date,
        slot: row.slot,
        recipeId: row.recipe_id,
    };
}
