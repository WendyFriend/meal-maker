import type { MealIngredient, MealType } from './types.ts';

export type Recipe = {
    id?: string;
    userId: string;
    recipeName: string;
    ingredients: MealIngredient[];
    instructions: string[];
    servings?: number;
    // 'generated' = saved from an AI meal; 'manual' = built by the user.
    source?: 'generated' | 'manual';
    mealType?: MealType;
    createdAt?: string;
};

/* Id of one of the user's meal periods (see MealSlotConfig); the defaults
   are 'breakfast', 'lunch', 'snack' and 'dinner'. */
export type MealPlanSlot = string;

/* A saved meal placed on a day + meal period. */
export type MealPlanEntry = {
    id: string;
    planDate: string; // YYYY-MM-DD
    slot: MealPlanSlot;
    recipeId: string;
    // Portions of the recipe's single serving eaten, e.g. 1.5.
    servings: number;
};

export type ShoppingListItem = {
    id: string;
    name: string;
    quantity?: string; // free text, e.g. "450 g"
    checked: boolean;
};
