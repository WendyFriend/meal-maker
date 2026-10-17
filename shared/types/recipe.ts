import type { MealIngredient } from './types';

export type Recipe = {
    id?: string;
    userId: string;
    recipeName: string;
    ingredients: MealIngredient[];
    instructions: string[];
};
