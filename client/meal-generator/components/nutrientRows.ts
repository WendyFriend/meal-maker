import {
    NUTRIENT_GROUP_LABELS,
    NUTRIENTS,
    percentDailyValue,
    type Micronutrients,
    type NutrientDefinition,
    type NutrientGroup,
    type NutrientKey,
} from '../../../shared/nutrition/nutrients';
import type { IngredientNutrition } from '../../../shared/types/types';

export type NutrientRow = {
    nutrient: NutrientDefinition;
    amount: number;
    // Share of the Daily Value; undefined for nutrients without one.
    percent?: number;
};

export type NutrientRowGroup = {
    group: NutrientGroup;
    label: string;
    rows: NutrientRow[];
};

const GROUP_ORDER: NutrientGroup[] = ['carbs-fats', 'minerals', 'vitamins'];

/* Per 100 g: the USDA nutrients plus the basics the ingredient carries as
   dedicated fields (user-entered ingredients have only those). */
export function getIngredientMicronutrients(
    ingredient: IngredientNutrition,
): Micronutrients {
    const basics: Micronutrients = {};

    if (typeof ingredient.fiberPer100g === 'number')
        basics.fiber = ingredient.fiberPer100g;
    if (typeof ingredient.sugarPer100g === 'number')
        basics.sugar = ingredient.sugarPer100g;
    if (typeof ingredient.saturatedFatPer100g === 'number')
        basics.saturatedFat = ingredient.saturatedFatPer100g;

    return { ...basics, ...ingredient.micronutrientsPer100g };
}

export function hasMicronutrients(ingredient: IngredientNutrition): boolean {
    return Object.values(ingredient.micronutrientsPer100g ?? {}).some(
        (value) => typeof value === 'number',
    );
}

/* Nutrients with data, grouped for display. `visibleKeys` limits them (the
   free plan's basics); nutrients with no data are left out. */
export function groupNutrients(
    amounts: Micronutrients,
    visibleKeys?: NutrientKey[],
): NutrientRowGroup[] {
    return GROUP_ORDER.map((group) => ({
        group,
        label: NUTRIENT_GROUP_LABELS[group],
        rows: NUTRIENTS.filter(
            (nutrient) =>
                nutrient.group === group &&
                typeof amounts[nutrient.key] === 'number' &&
                (!visibleKeys || visibleKeys.includes(nutrient.key)),
        ).map((nutrient) => {
            const amount = amounts[nutrient.key] as number;

            return {
                nutrient,
                amount,
                percent: percentDailyValue(nutrient.key, amount),
            };
        }),
    })).filter(({ rows }) => rows.length > 0);
}

/* 0.15 → "0.15", 3.46 → "3.5", 12.4 → "12", 420.2 → "420" */
export function formatAmount(value: number): string {
    if (value >= 10) return String(Math.round(value));
    if (value >= 1) return String(Number(value.toFixed(1)));

    return String(Number(value.toFixed(2)));
}
