import type { IngredientInfo, UserIngredient } from "../../shared/types/types";

export function isUserIngredient(
    ingredient: UserIngredient | IngredientInfo,
): ingredient is UserIngredient {
    return 'ingredientId' in ingredient;
}
