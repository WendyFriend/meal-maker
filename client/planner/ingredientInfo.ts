import { normalizeIngredientName } from '../utils/Ingredient';
import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

/* What to send for a chosen ingredient: its saved nutrition when the name
   matches one of the user's ingredients, otherwise just the name (the
   server matches it to USDA itself). */
export function toIngredientInfo(
    name: string,
    savedIngredients: UserIngredient[],
): IngredientInfo {
    const normalized = normalizeIngredientName(name);
    const saved = savedIngredients.find(
        (ingredient) => normalizeIngredientName(ingredient.name) === normalized,
    );

    if (!saved) return { name };

    return {
        name: saved.name,
        caloriesPer100g: saved.caloriesPer100g,
        proteinPer100g: saved.proteinPer100g,
        carbohydratePer100g: saved.carbohydratePer100g,
        fatPer100g: saved.fatPer100g,
        sugarPer100g: saved.sugarPer100g,
        saturatedFatPer100g: saved.saturatedFatPer100g,
        fiberPer100g: saved.fiberPer100g,
        micronutrientsPer100g: saved.micronutrientsPer100g,
        usda: saved.usda,
    };
}
