import type { MealIngredient } from './types';

/** A snapshot of the portions eaten, independent of later saved-meal edits. */
export type JournalEntry = {
    id: string;
    eatenAt: string;
    mealName: string;
    ingredients: MealIngredient[];
    planPosition?: number;
};
export type JournalEntryInput = Omit<JournalEntry, 'id' | 'planPosition'>;
