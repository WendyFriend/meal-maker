export type IngredientInfo = {
    name: string;
    caloriesPer100g?: number;
    proteinPer100g?: number;
    carbohydratePer100g?: number;
    fatPer100g?: number;
    sugarPer100g?: number;
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
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
};

export type UnresolvedIngredient = {
    name: string;
    reason: 'not_found' | 'missing_nutrition';
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type DietaryPreference =
    | 'vegetarian'
    | 'vegan'
    | 'dairy-free'
    | 'gluten-free';

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
};

/* GET /api/nutrition?q=<text> → { results: NutritionSearchResult[] } */
export type NutritionSearchResult = IngredientNutrition & {
    source: 'usda';
    description: string; // USDA's own food description
};

export type NutritionSearchResponse = {
    results: NutritionSearchResult[];
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
};

export type MealIngredient = IngredientNutrition & {
    weight: number;
};
