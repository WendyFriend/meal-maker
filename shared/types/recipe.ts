import type { MealIngredient } from './types';

export type Recipe = {
    id?: string;
    userId: string;
    recipeName: string;
    ingredients: MealIngredient[];
    instructions: string[];
    servings?: number;
};

/* A saved recipe placed on the weekly plan. */
export type MealPlanSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealPlanEntry = {
    id: string;
    planDate: string; // YYYY-MM-DD
    slot: MealPlanSlot;
    recipeId: string;
};

export type ShoppingListItem = {
    id: string;
    name: string;
    quantity?: string; // free text, e.g. "450 g"
    checked: boolean;
};
