import type { IngredientInfo, MealIngredient } from '../../shared/types/types';

/** A 100g meal ingredient; missing macros mark its nutrition unavailable. */
export function newIngredient(source: IngredientInfo): MealIngredient {
    const missingNutrition = [
        source.caloriesPer100g,
        source.proteinPer100g,
        source.carbohydratePer100g,
        source.fatPer100g,
    ].some((value) => !Number.isFinite(value));
    return {
        ...source,
        weight: 100,
        caloriesPer100g: source.caloriesPer100g ?? 0,
        proteinPer100g: source.proteinPer100g ?? 0,
        carbohydratePer100g: source.carbohydratePer100g ?? 0,
        fatPer100g: source.fatPer100g ?? 0,
        ...(missingNutrition ? { nutritionUnavailable: true as const } : {}),
    };
}

/**
 * Applies an ingredient sheet's fix to a meal's ingredient: fixes keep the
 * typed name, a rename from the title (`rename`) takes the new one; the
 * weight always stays.
 */
export function fromSheet(
    original: MealIngredient,
    corrected: IngredientInfo,
    rename: boolean,
): MealIngredient {
    const nutrition: IngredientInfo & {
        ingredientId?: string;
        weight?: number;
        nutritionUnavailable?: true;
    } = { ...corrected };
    // The entry is a copy: no link to a saved record, and availability is
    // worked out again from the new numbers.
    delete nutrition.ingredientId;
    delete nutrition.preparationTips;
    delete nutrition.weight;
    delete nutrition.nutritionUnavailable;
    return {
        ...newIngredient({
            ...nutrition,
            name: rename ? corrected.name : original.name,
        }),
        weight: original.weight,
    };
}
