export type IngredientNutrition = {
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
};

export type MealIngredient = {
    name: string;
    amount: number;
    // calories: number;
    // protein: number;
};

export type MealIngredientWithNutrition = MealIngredient & {
    calories: number;
    protein: number;
};

export type MealRequirements = {
    calories: number;
    proteinPercentage: number;
};

export type GenerateMealInput = {
    ingredients: IngredientNutrition[];
    requirements: MealRequirements;
};

export type Meal = MealIngredient[];

