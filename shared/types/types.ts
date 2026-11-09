import type { MicronutrientValues } from '../micronutrients.js';

export type IngredientInfo = MicronutrientValues & {
    preparationTips?: string[];
    name: string;
    // The Nutrition Lab's name for the matched food; shown in meal results.
    resolvedName?: string;
    caloriesPer100g?: number;
    proteinPer100g?: number;
    carbohydratePer100g?: number;
    fatPer100g?: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
};

export type UserIngredient = MicronutrientValues & {
    preparationTips?: string[];
    ingredientId: string; // database id
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
};

export const MEAL_GENERATORS = ['ollama', 'nutrition-lab'] as const;
export type MealGenerator = (typeof MEAL_GENERATORS)[number];
export const DEFAULT_MEAL_GENERATOR: MealGenerator = 'nutrition-lab';

export type GenerateMealRequest = {
    ingredients: IngredientInfo[];
    requirements: MealRequirements;
};

export type GenerateMealResponse = {
    mealName: string;
    ingredients: MealIngredient[];
    instructions: string[];
};

export type UnresolvedIngredient = {
    name: string;
    reason: 'not_found' | 'missing_nutrition';
};

export type MealRequirements = {
    calories?: number;
    proteinGrams?: number;
    proteinPercentage?: number;
    preferences?: MealPreference[];
};

export type MealPreference =
    'high-protein' | 'under-25-minutes' | 'plant-based' | 'low-carb';

export type IngredientNutrition = MicronutrientValues & {
    preparationTips?: string[];
    name: string;
    resolvedName?: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
};

export type MealIngredient = IngredientNutrition & {
    weight: number;
    thumbnailSource?: 'nutrition-lab' | 'local';
};
