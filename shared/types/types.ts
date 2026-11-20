import type {
    MicronutrientKey,
    MicronutrientValues,
} from '../micronutrients.js';
import type { Diet } from '../diets.js';

export type IngredientInfo = MicronutrientValues & {
    preparationTips?: string[];
    name: string;
    // The Nutrition Lab's name for the matched food; shown in nutrition details.
    resolvedName?: string;
    caloriesPer100g?: number;
    proteinPer100g?: number;
    carbohydratePer100g?: number;
    fatPer100g?: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
};

/** Per-100g values read from a photographed nutrition label. */
export type NutritionLabelScan = {
    // Only what the label prints; a missing field is unknown, not zero.
    nutrition: Partial<
        Pick<
            IngredientInfo,
            | 'caloriesPer100g'
            | 'proteinPer100g'
            | 'carbohydratePer100g'
            | 'fatPer100g'
            | 'sugarPer100g'
            | 'saturatedFatPer100g'
            | 'fiberPer100g'
            | MicronutrientKey
        >
    >;
    // Drinks are labelled per 100 mL.
    basis: '100g' | '100mL';
    // Things to check, such as numbers that don't add up.
    warnings: string[];
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
    /** The user's diet from Profile, applied to every meal. */
    dietary?: Diet[];
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
    /** Set on ingredients from Nutrition Lab generation, which carry their own food data. */
    thumbnailSource?: 'nutrition-lab';
    /** The name was entered without reliable macro data; numeric placeholders are not nutrition values. */
    nutritionUnavailable?: true;
};
