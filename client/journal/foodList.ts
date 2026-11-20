import type { MealIngredient } from '../../shared/types/types';
import { normalizeIngredientName } from '../utils/Ingredient';

/** The same food: its database match when known, else its name. */
function foodKey(ingredient: MealIngredient) {
    const fdcId = ingredient.nutritionSource?.fdcId;
    const food = fdcId
        ? `fdc:${fdcId}`
        : normalizeIngredientName(ingredient.resolvedName ?? ingredient.name);
    // Only merge portions with the same per-100g nutrition, so the summed
    // weight still gives the right calories (a corrected entry stays apart).
    const nutrition = ingredient.nutritionUnavailable
        ? 'unavailable'
        : [
              ingredient.caloriesPer100g,
              ingredient.proteinPer100g,
              ingredient.carbohydratePer100g,
              ingredient.fatPer100g,
          ].join('/');
    return `${food}|${nutrition}`;
}

/**
 * A day's foods across all its meals, one row per food with the portions
 * added up, in the order each food first appears.
 */
export function combineFoods(ingredients: MealIngredient[]): MealIngredient[] {
    const foods = new Map<string, MealIngredient>();
    for (const ingredient of ingredients) {
        const key = foodKey(ingredient);
        const food = foods.get(key);
        foods.set(
            key,
            food
                ? { ...food, weight: food.weight + ingredient.weight }
                : ingredient,
        );
    }
    return [...foods.values()];
}
