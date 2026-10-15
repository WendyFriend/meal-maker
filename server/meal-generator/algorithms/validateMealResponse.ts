import type {
    GenerateMealResponse,
    MealIngredient,
} from '../../../shared/types/types.js';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
    return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
}

function isMealIngredient(value: unknown): value is MealIngredient {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.name === 'string' &&
        typeof value.weight === 'number' &&
        typeof value.caloriesPer100g === 'number' &&
        typeof value.proteinPer100g === 'number' &&
        typeof value.carbohydratePer100g === 'number' &&
        typeof value.fatPer100g === 'number'
    );
}

export function isGenerateMealResponse(
    value: unknown,
): value is GenerateMealResponse {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.mealName === 'string' &&
        Array.isArray(value.ingredients) &&
        value.ingredients.every(isMealIngredient) &&
        isNonEmptyStringArray(value.instructions)
    );
}
