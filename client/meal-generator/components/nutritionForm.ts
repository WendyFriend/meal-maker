import type {
    IngredientInfo,
    NutritionLabelScan,
} from '../../../shared/types/types';
import {
    MICRONUTRIENTS,
    type MicronutrientKey,
} from '../../../shared/micronutrients';
import { hasMicronutrientValue } from '../../services/micronutrientService';
import {
    ingredientDraftFromFoodSearch,
    type FoodSearchResult,
} from '../../services/foodSearchService';
import type { NutritionFieldId } from './NutritionField';

/** The per-100g macro fields the ingredient sheet can correct. */
export const MACRO_FIELDS: readonly NutritionFieldId[] = [
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
    'sugarPer100g',
    'saturatedFatPer100g',
    'fiberPer100g',
];

/** Text field values while correcting an ingredient's numbers. */
export type NutritionForm = {
    macros: Record<NutritionFieldId, string>;
    micros: Partial<Record<MicronutrientKey, string>>;
};

const amountText = (value: number | undefined) =>
    hasMicronutrientValue(value) ? String(value) : '';

const amount = (text: string | undefined) => {
    const trimmed = text?.trim() ?? '';
    return trimmed === '' ? undefined : Number(trimmed);
};

/** Fills the form from the nutrition currently shown for an ingredient. */
export function nutritionForm(ingredient: IngredientInfo): NutritionForm {
    return {
        macros: Object.fromEntries(
            MACRO_FIELDS.map((field) => [field, amountText(ingredient[field])]),
        ) as NutritionForm['macros'],
        micros: Object.fromEntries(
            MICRONUTRIENTS.map(({ key }) => [key, amountText(ingredient[key])]),
        ),
    };
}

/** A label scan's values as form text; fields it didn't read are left out. */
export function labelFormValues(nutrition: NutritionLabelScan['nutrition']): {
    macros: Partial<NutritionForm['macros']>;
    micros: NutritionForm['micros'];
} {
    const text = <K extends keyof typeof nutrition>(keys: readonly K[]) =>
        Object.fromEntries(
            keys
                .filter((key) => nutrition[key] !== undefined)
                .map((key) => [key, String(nutrition[key])]),
        );
    return {
        macros: text(MACRO_FIELDS),
        micros: text(MICRONUTRIENTS.map(({ key }) => key)),
    };
}

/**
 * Applies the form to an ingredient. Blank macros become unknown. A typed
 * micronutrient becomes available again; a cleared one is marked unavailable
 * so a reference lookup never refills it.
 */
export function applyNutritionForm<T extends IngredientInfo>(
    ingredient: T,
    { macros, micros }: NutritionForm,
): T {
    const unavailable = new Set(ingredient.unavailableMicronutrients);
    const microAmounts = Object.fromEntries(
        MICRONUTRIENTS.map(({ key }) => {
            const value = amount(micros[key]);
            if (value !== undefined) unavailable.delete(key);
            else if (hasMicronutrientValue(ingredient[key]))
                unavailable.add(key);
            return [key, value];
        }),
    );
    return {
        ...ingredient,
        ...Object.fromEntries(
            MACRO_FIELDS.map((field) => [field, amount(macros[field])]),
        ),
        ...microAmounts,
        unavailableMicronutrients: unavailable.size
            ? [...unavailable]
            : undefined,
    };
}

/**
 * The ingredient as the picked database food, keeping the user's name and
 * record. Nutrition the food lacks is unavailable, never carried over from
 * the previous match.
 */
export function ingredientFromFood(
    food: FoodSearchResult,
    current: IngredientInfo,
    ingredientId?: string,
): IngredientInfo {
    const draft = ingredientDraftFromFoodSearch(food);
    return {
        ...draft,
        ...(ingredientId && { ingredientId }),
        ...(current.preparationTips && {
            preparationTips: current.preparationTips,
        }),
        name: current.name,
        resolvedName: food.name,
        unavailableMicronutrients: MICRONUTRIENTS.map(({ key }) => key).filter(
            (key) => draft[key] === undefined,
        ),
    };
}

/** An error's message, or a friendly fallback. */
export function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
