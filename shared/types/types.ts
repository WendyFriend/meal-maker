import type { Micronutrients } from '../nutrition/nutrients.ts';
import type { PrepConsideration } from '../nutrition/prepGuidance.ts';

export type IngredientInfo = {
    name: string;
    caloriesPer100g?: number;
    proteinPer100g?: number;
    carbohydratePer100g?: number;
    fatPer100g?: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
    micronutrientsPer100g?: Micronutrients;
    usda?: UsdaReference;
};

/* The USDA FoodData Central food a nutrition profile came from. */
export type UsdaReference = {
    fdcId: number;
    description: string;
};

export type UserIngredient = {
    ingredientId: string; // database id
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
    micronutrientsPer100g?: Micronutrients;
    usda?: UsdaReference;
    isFavorite?: boolean;
} & PantryDetails;

/* What the user has on hand. All optional; stored on user_ingredients. */
export type PantryDetails = {
    quantity?: number;
    unit?: string;
    expiresOn?: string; // ISO date, YYYY-MM-DD
};

export type GenerateMealRequest = {
    ingredients: IngredientInfo[];
    requirements: MealRequirements;
};

export type GenerateMealResponse = {
    mealName: string;
    ingredients: MealIngredient[];
    instructions: string[];
    // Weights and nutrition are per serving; defaults to 1.
    servings?: number;
    // Names of ingredients whose nutrition the server had to estimate
    // because the request didn't supply it.
    estimatedIngredients?: string[];
    // Anti-nutrient, toxin and food-safety preparation guidance for the
    // meal's ingredients (see shared/nutrition/prepGuidance.ts).
    considerations?: PrepConsideration[];
};

export type UnresolvedIngredient = {
    name: string;
    reason: 'not_found' | 'missing_nutrition';
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type DietaryPreference =
    'vegetarian' | 'vegan' | 'dairy-free' | 'gluten-free';

/* Tweaks for "try another" / "make it ..." regenerations. */
export type MealVariation = 'different' | 'higher-protein' | 'lower-calorie';

export type MealRequirements = {
    calories?: number; // per serving
    proteinPercentage?: number; // % of energy from protein
    servings?: number;
    mealType?: MealType;
    dietary?: DietaryPreference[];
    variation?: MealVariation;
    // Name of the meal being varied, so the model avoids repeating it.
    previousMealName?: string;
    // Set by the day planner so the meal fits the rest of the day.
    dayContext?: DayContext;
};

/* What's already planned for the day, so a recommendation fills the gap. */
export type DayContext = {
    slotLabel: string;
    dailyTargets: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        fiberG: number;
    };
    // Totals of the other meals already planned that day.
    plannedSoFar: {
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        fiberG: number;
    };
    // Nutrient labels the day is short on, e.g. ["Fibre", "Vitamin C"].
    focusNutrients?: string[];
};

/* GET /api/nutrition?q=<text> → { results: NutritionSearchResult[] } */
export type NutritionSearchResult = IngredientNutrition & {
    source: 'usda';
    description: string; // USDA's own food description
};

export type NutritionSearchResponse = {
    results: NutritionSearchResult[];
};

/* POST /api/match-ingredients { names } → { matches } */
export type MatchIngredientsRequest = {
    names: string[];
};

export type IngredientMatch = {
    query: string; // the name as the user typed it
    // Closest USDA food, or null when nothing plausible was found.
    match: NutritionSearchResult | null;
    // Other candidates the user can switch to, best first.
    alternatives: NutritionSearchResult[];
    confidence: 'high' | 'low';
};

export type MatchIngredientsResponse = {
    matches: IngredientMatch[];
};

export type IngredientNutrition = {
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
    micronutrientsPer100g?: Micronutrients;
    usda?: UsdaReference;
    // Where the per-100 g values came from.
    nutritionSource?: 'usda' | 'user' | 'estimated';
};

export type MealIngredient = IngredientNutrition & {
    weight: number;
};
