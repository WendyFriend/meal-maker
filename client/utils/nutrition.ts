import type { MealIngredient } from '../../shared/types/types';

export function hasUnavailableNutrition(ingredients: MealIngredient[]) {
    return ingredients.some(
        (ingredient) =>
            ingredient.weight > 0 && ingredient.nutritionUnavailable,
    );
}

export function knownNutritionIngredients(ingredients: MealIngredient[]) {
    return ingredients.filter(
        (ingredient) =>
            ingredient.weight > 0 && !ingredient.nutritionUnavailable,
    );
}

export function totalNutrition(ingredients: MealIngredient[]) {
    return ingredients.reduce(
        (total, ingredient) => {
            const portion = ingredient.weight / 100;
            total.calories += ingredient.caloriesPer100g * portion;
            total.protein += ingredient.proteinPer100g * portion;
            total.carbohydrate += ingredient.carbohydratePer100g * portion;
            total.fat += ingredient.fatPer100g * portion;
            return total;
        },
        { calories: 0, protein: 0, carbohydrate: 0, fat: 0 },
    );
}

export function totalFiber(ingredients: MealIngredient[]) {
    const included = ingredients.filter(({ weight }) => weight > 0);
    const known = included.filter(
        ({ fiberPer100g }) =>
            typeof fiberPer100g === 'number' &&
            Number.isFinite(fiberPer100g) &&
            fiberPer100g >= 0,
    );
    return {
        grams: known.reduce(
            (sum, ingredient) =>
                sum + (ingredient.fiberPer100g! * ingredient.weight) / 100,
            0,
        ),
        available: included.length > 0 && known.length === included.length,
        incomplete: known.length < included.length,
        hasKnown: known.length > 0,
    };
}

/**
 * The calorie track's full width for a list of ingredients: twice the
 * largest portion, rounded up to 100 kcal and at least 500, so bars compare
 * across rows and leave room for bigger portions.
 */
export function calorieScale(ingredients: MealIngredient[]) {
    const largest = Math.max(
        0,
        ...ingredients.map((ingredient) =>
            ingredient.nutritionUnavailable
                ? 0
                : (ingredient.caloriesPer100g * ingredient.weight) / 100,
        ),
    );
    return Math.max(500, Math.ceil((largest * 2) / 100) * 100);
}
