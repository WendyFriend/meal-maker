import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

export function normalizeIngredientName(name: string): string {
    return name.trim().toLowerCase();
}

export function isUserIngredient(
    ingredient: UserIngredient | IngredientInfo,
): ingredient is UserIngredient {
    return 'ingredientId' in ingredient;
}

/** Keep user-provided values while filling their missing nutrition fields. */
export function mergeIngredientNutrition(
    ingredient: IngredientInfo,
    lookup: IngredientInfo,
): IngredientInfo {
    return {
        ...lookup,
        ...Object.fromEntries(
            Object.entries(ingredient).filter(([, value]) => value != null),
        ),
        name: ingredient.name,
    };
}

const requiredMacroFields = [
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
] as const;

export function needsMacroNutrition(ingredient: IngredientInfo): boolean {
    return requiredMacroFields.some((field) => {
        const value = ingredient[field];
        return (
            typeof value !== 'number' || !Number.isFinite(value) || value < 0
        );
    });
}
