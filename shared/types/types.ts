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
    proteinPercentage?: number;
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
