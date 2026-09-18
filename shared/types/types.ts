export type IngredientInfo = {
    name: string;
    caloriesPer100g?: number;
    proteinPer100g?: number;
    carbohydratePer100g?: number;
    fatPer100g?: number;
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
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
};

export type GenerateMealRequest = {
    ingredients: IngredientInfo[];
    requirements: MealRequirements;
};

export type GenerateMealResponse = {
    mealIngredients: MealIngredient[];
    unresolvedIngredients: UnresolvedIngredient[];
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
    saturatedFatPer100g?: number;
    fiberPer100g?: number;
};

export type MealIngredient = IngredientNutrition & {
    weight: number;
};
