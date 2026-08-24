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
    ingredients: string[]; // what the user entered
    nutrition: IngredientNutrition[]; // information we found in our database
    requirements: {
        calories?: number;
        proteinPercentage?: number;
    };
};

export type Meal = MealIngredient[];

export type GeneratedMeal = {
    meal: Meal;
    nutrition: IngredientNutrition[];
};
