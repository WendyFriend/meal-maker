import type { DietaryPreference, MealType } from '../../../shared/types/types';

export type MealOptionsValue = {
    proteinPercentage?: number;
    servings: number;
    mealType?: MealType;
    dietary: DietaryPreference[];
};

export const DEFAULT_MEAL_OPTIONS: MealOptionsValue = {
    servings: 1,
    dietary: [],
};
