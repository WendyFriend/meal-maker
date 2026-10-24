import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

export function normalizeIngredientName(name: string): string {
    return name.trim().toLowerCase();
}

export function isUserIngredient(
    ingredient: UserIngredient | IngredientInfo,
): ingredient is UserIngredient {
    return 'ingredientId' in ingredient;
}
