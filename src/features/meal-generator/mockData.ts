export type IngredientNutrition = {
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
};

export type MealIngredient = {
    name: string;
    amount: number;
};
export const mockIngredientNutrition: IngredientNutrition[] = [
    {
        name: 'Tofu',
        caloriesPer100g: 130,
        proteinPer100g: 14,
    },
    {
        name: 'Kale',
        caloriesPer100g: 35,
        proteinPer100g: 3,
    },
    {
        name: 'Oats',
        caloriesPer100g: 389,
        proteinPer100g: 17,
    },
    {
        name: 'Pumpkin',
        caloriesPer100g: 26,
        proteinPer100g: 1,
    },
];

export const mockMeal: MealIngredient[] = [
    {
        name: 'Tofu',
        amount: 100,
    },
    {
        name: 'Pumpkin',
        amount: 200,
    },
    {
        name: 'Kale',
        amount: 150,
    },
    {
        name: 'Oats',
        amount: 50,
    },
];
