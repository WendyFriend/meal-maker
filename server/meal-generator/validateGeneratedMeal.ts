import type { GeneratedMeal } from '../../src/features/meal-generator/types.js';

export function isGeneratedMeal(value: unknown): value is GeneratedMeal {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const meal = (value as Record<string, unknown>).meal;

    if (!meal || typeof meal !== 'object') {
        return false;
    }

    const mealRecord = meal as Record<string, unknown>;

    if (
        typeof mealRecord.totalCalories !== 'number' ||
        typeof mealRecord.totalProteinGrams !== 'number' ||
        !Array.isArray(mealRecord.ingredients)
    ) {
        return false;
    }

    return mealRecord.ingredients.every((ingredient) => {
        if (!ingredient || typeof ingredient !== 'object') {
            return false;
        }

        const item = ingredient as Record<string, unknown>;

        return (
            typeof item.name === 'string' &&
            typeof item.amount === 'number' &&
            typeof item.caloriesPer100g === 'number' &&
            typeof item.proteinPer100g === 'number'
        );
    });
}
