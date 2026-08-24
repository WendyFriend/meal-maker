import type { IngredientNutrition, Meal } from './types';

export const mockMeal: Meal = [
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
        amount: 180,
    },
    {
        name: 'Oats',
        amount: 50,
    },
];

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
