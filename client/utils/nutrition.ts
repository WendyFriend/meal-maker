import type { MealIngredient } from '../../shared/types/types';

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
