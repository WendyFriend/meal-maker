import { mockMeal } from '../mockData';
import type { GenerateMealInput, IngredientNutrition, Meal } from './types';

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

const input: GenerateMealInput = {
    ingredients: mockIngredientNutrition,
    requirements: {
        calories: 500,
        proteinPercentage: 20,
    },
};

export async function generateMeal(_input: GenerateMealInput): Promise<Meal> {
    return mockMeal;
}