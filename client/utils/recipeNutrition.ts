import { MICRONUTRIENTS } from '../../shared/micronutrients';
import type { IngredientInfo, MealIngredient } from '../../shared/types/types';
import {
    hasMicronutrientValue,
    micronutrientLookupKey,
} from '../services/micronutrientService';

const RECIPE_NUTRIENT_FIELDS = [
    ...MICRONUTRIENTS.map(({ key }) => key),
    'fiberPer100g',
] as const;

type RecipeNutrientField = (typeof RECIPE_NUTRIENT_FIELDS)[number];
type MicronutrientField = (typeof MICRONUTRIENTS)[number]['key'];

function hasSavedNutrient(
    ingredient: MealIngredient,
    field: RecipeNutrientField,
) {
    // JSON serialization omits undefined, so it is not a saved value.
    return Object.hasOwn(ingredient, field) && ingredient[field] !== undefined;
}

function canFillNutrient(
    ingredient: MealIngredient,
    field: RecipeNutrientField,
    value: unknown,
): value is number {
    return (
        !hasSavedNutrient(ingredient, field) &&
        (field === 'fiberPer100g' ||
            !ingredient.unavailableMicronutrients?.includes(
                field as MicronutrientField,
            )) &&
        hasMicronutrientValue(value)
    );
}

export type RecipeNutritionEnrichment = {
    index: number;
    name: string;
    nutrients: Partial<Record<RecipeNutrientField, number>>;
};

/** Only fill fields absent from the saved ingredient. Existing zeroes count as values. */
export function recipeNutritionEnrichments(
    ingredients: MealIngredient[],
    lookups: Record<string, IngredientInfo>,
): RecipeNutritionEnrichment[] {
    return ingredients.flatMap((ingredient, index) => {
        const lookup = lookups[micronutrientLookupKey(ingredient.name)];
        if (!lookup) return [];
        const nutrients: RecipeNutritionEnrichment['nutrients'] = {};
        for (const field of RECIPE_NUTRIENT_FIELDS) {
            const value = lookup[field];
            if (canFillNutrient(ingredient, field, value))
                nutrients[field] = value;
        }
        return Object.keys(nutrients).length
            ? [{ index, name: ingredient.name, nutrients }]
            : [];
    });
}

export function fillMissingRecipeNutrition(
    ingredients: MealIngredient[],
    enrichments: RecipeNutritionEnrichment[],
): MealIngredient[] {
    let next = ingredients;
    for (const { index, name, nutrients } of enrichments) {
        const ingredient = next[index];
        if (!ingredient || ingredient.name !== name) continue;
        const additions = Object.fromEntries(
            Object.entries(nutrients).filter(
                ([field, value]) =>
                    RECIPE_NUTRIENT_FIELDS.includes(
                        field as RecipeNutrientField,
                    ) &&
                    canFillNutrient(
                        ingredient,
                        field as RecipeNutrientField,
                        value,
                    ),
            ),
        );
        if (!Object.keys(additions).length) continue;
        if (next === ingredients) next = [...ingredients];
        next[index] = { ...ingredient, ...additions };
    }
    return next;
}
