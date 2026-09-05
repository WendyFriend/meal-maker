import type {
    GenerateMealResponse,
    MealIngredient,
    MealRequirements,
} from '../../../shared/types/types.ts';

export type IngredientNutrition = {
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    saturatedFatPer100g: number;
    fiberPer100g: number;
};

export type IngredientRole = {
    isNonStarchyVegetable: boolean;
    isProteinSource: boolean;
};

export const APPROXIMATE_MEAL_CALORIE_DENSITY = 0.8;

export type ClassifiedIngredient = IngredientNutrition & IngredientRole;

export function generateMeal(
    ingredientNutritions: IngredientNutrition[],
    requirements: MealRequirements,
): MealIngredient[] {
    const classifiedIngredients = classifyIngredients(
        ingredientNutritions,
        requirements.proteinPercentage ?? 30,
    );

    const meal = [];

    // veggies
    const veggies = classifiedIngredients.filter(
        (i) => i.isNonStarchyVegetable,
    );

    const approximateVeggiesWeight = approximateTotalVeggieWeight(
        requirements.calories ?? 600,
    );
    const veggiesWithWeight = getVeggies(approximateVeggiesWeight, veggies);
    meal.push(...veggiesWithWeight);

    // protein
    const proteinGramsSoFar = meal.reduce(
        (total, ingredient) =>
            total + (ingredient.proteinPer100g * ingredient.weight) / 100,
        0,
    );

    const targetCalories = requirements.calories ?? 600;
    const targetProteinPercentage = requirements.proteinPercentage ?? 30;
    const targetProteinGrams = getTargetProteinGrams(
        targetCalories,
        targetProteinPercentage,
    );
    const proteinGramsNeeded = Math.max(
        0,
        targetProteinGrams - proteinGramsSoFar,
    );
    const proteinSources = classifiedIngredients.filter(
        (i) => i.isProteinSource,
    );
    const proteinSourcesWithWeight = getProteinSourcesWithWeight(
        proteinGramsNeeded,
        proteinSources,
    );
    meal.push(...proteinSourcesWithWeight);

    // the rest
    const caloriesSoFar = meal.reduce(
        (total, ingredient) =>
            total + (ingredient.caloriesPer100g * ingredient.weight) / 100,
        0,
    );

    const caloriesLeft = Math.max(0, targetCalories - caloriesSoFar);
    const unusedIngredients = classifiedIngredients.filter(
        (i) => !i.isProteinSource && !i.isNonStarchyVegetable,
    );

    const otherIngredientsWithWeight = getOtherIngredientsWithWeight(
        caloriesLeft,
        unusedIngredients,
    );
    meal.push(...otherIngredientsWithWeight);
    const consolidatedMeal = consolidateIngredients(meal);
    return consolidatedMeal;
}

export function consolidateIngredients(
    ingredients: MealIngredient[],
): MealIngredient[] {
    const result = new Map<string, MealIngredient>();

    for (const ingredient of ingredients) {
        const existing = result.get(ingredient.name);

        if (existing) {
            existing.weight += ingredient.weight;
        } else {
            result.set(ingredient.name, { ...ingredient });
        }
    }

    return [...result.values()];
}

export function getOtherIngredientsWithWeight(
    targetCalories: number,
    ingredients: IngredientNutrition[],
) {
    const caloriesNeeded = Math.max(0, targetCalories);
    const numberOfOtherIngredients = ingredients.length;
    if (numberOfOtherIngredients === 0 || caloriesNeeded <= 0) {
        return [];
    }
    const eachIngredientCaloriesContribution =
        caloriesNeeded / numberOfOtherIngredients;
    const result = ingredients.map((ingredient) => {
        if (ingredient.caloriesPer100g === 0) {
            return {
                ...ingredient,
                weight: 0,
            };
        }
        const weight =
            (eachIngredientCaloriesContribution / ingredient.caloriesPer100g) *
            100;
        const rounded = Math.round(weight / 5) * 5;
        return {
            ...ingredient,
            weight: rounded,
        };
    });
    return result;
}

export function getProteinSourcesWithWeight(
    targetProteinGrams: number,
    proteinSources: IngredientNutrition[],
) {
    const proteinGramsNeeded = Math.max(0, targetProteinGrams);
    const numberOfProteinSources = proteinSources.length;
    if (numberOfProteinSources == 0) {
        return [];
    }
    const eachSourceProteinContribution =
        (proteinGramsNeeded / numberOfProteinSources) * 0.8; // leave room for protein from carb sources
    const result = proteinSources.map((ingredient) => {
        const grams =
            (eachSourceProteinContribution / ingredient.proteinPer100g) * 100;
        const rounded = Math.round(grams / 10) * 10;
        return {
            ...ingredient,
            weight: rounded,
        };
    });
    return result;
}

export function getTargetProteinGrams(
    totalCalories: number,
    proteinPercentage: number,
): number {
    return Math.round((totalCalories * proteinPercentage) / 100 / 4);
}
export function classifyIngredients(
    ingredients: IngredientNutrition[],
    proteinTarget: number,
): ClassifiedIngredient[] {
    return ingredients.map((ingredient) => {
        const isNonStarchyVegetable =
            ingredient.caloriesPer100g <= 50 &&
            ingredient.carbohydratePer100g <= 10;

        const proteinCaloriePercentage =
            ingredient.caloriesPer100g > 0
                ? ((ingredient.proteinPer100g * 4) /
                      ingredient.caloriesPer100g) *
                  100
                : 0;

        const isProteinSource = proteinCaloriePercentage >= proteinTarget;

        return {
            ...ingredient,
            isNonStarchyVegetable,
            isProteinSource,
        };
    });
}

export function approximateTotalVeggieWeight(totalCalories: number): number {
    return (totalCalories / APPROXIMATE_MEAL_CALORIE_DENSITY) * 0.5;
}

export function getVeggies(
    approximateTotalVeggieWeight: number,
    veggies: IngredientNutrition[],
) {
    const numberOfVeggies = veggies.length;
    if (numberOfVeggies === 0) {
        return [];
    }
    const eachVeggiesWeight =
        Math.round(approximateTotalVeggieWeight / numberOfVeggies / 10) * 10;
    const result = veggies.map((ve) => ({
        ...ve,
        weight: eachVeggiesWeight,
    }));
    return result;
}
