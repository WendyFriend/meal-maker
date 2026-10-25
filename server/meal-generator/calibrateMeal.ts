import type { MealIngredient } from '../../shared/types/types.ts';

export type CalibrationTargets = {
    calories: number;
    // % of energy from protein; omit to keep the model's protein share.
    proteinPercentage?: number;
};

// Accept the meal once it's this close to the calorie target.
const CALORIE_TOLERANCE = 0.02;
// Never shrink or grow a portion beyond these factors in one pass.
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

function kcal(ingredient: MealIngredient, weight = ingredient.weight) {
    return (ingredient.caloriesPer100g * weight) / 100;
}

function proteinKcal(ingredient: MealIngredient, weight = ingredient.weight) {
    return (ingredient.proteinPer100g * 4 * weight) / 100;
}

export function getMealTotals(ingredients: MealIngredient[]) {
    const calories = ingredients.reduce((t, i) => t + kcal(i), 0);
    const protein = ingredients.reduce((t, i) => t + proteinKcal(i), 0);

    return {
        calories,
        proteinPercentage: calories > 0 ? (protein / calories) * 100 : 0,
    };
}

// Portions read naturally in 5 g steps; small amounts (oils, spices) in 1 g.
function roundWeight(weight: number) {
    if (weight < 20) return Math.max(1, Math.round(weight));
    return Math.max(5, Math.round(weight / 5) * 5);
}

/*
 * Two scale factors, one for protein-dense ingredients and one for the
 * rest, chosen so the meal hits both the calorie and protein targets:
 *   a·Kp + b·Ko = C        (calories)
 *   a·Pp + b·Po = C·p      (protein energy)
 * Returns null when the ingredients can't reach the protein target with
 * sensible portions.
 */
function solveTwoGroupScale(
    ingredients: MealIngredient[],
    calories: number,
    proteinShare: number,
) {
    const isDense = (i: MealIngredient) =>
        i.caloriesPer100g > 0 &&
        (i.proteinPer100g * 4) / i.caloriesPer100g > proteinShare;
    const dense = ingredients.filter(isDense);
    const other = ingredients.filter((i) => !isDense(i));

    if (dense.length === 0 || other.length === 0) return null;

    const Kp = dense.reduce((t, i) => t + kcal(i), 0);
    const Ko = other.reduce((t, i) => t + kcal(i), 0);
    const Pp = dense.reduce((t, i) => t + proteinKcal(i), 0);
    const Po = other.reduce((t, i) => t + proteinKcal(i), 0);
    const determinant = Kp * Po - Ko * Pp;

    if (Math.abs(determinant) < 1e-9) return null;

    const a = (calories * Po - Ko * calories * proteinShare) / determinant;
    const b = (Kp * calories * proteinShare - calories * Pp) / determinant;
    const inRange = (s: number) => s >= MIN_SCALE && s <= MAX_SCALE;

    if (!inRange(a) || !inRange(b)) return null;

    return (i: MealIngredient) => (isDense(i) ? a : b);
}

/*
 * The model picks the dish and rough portions, but its arithmetic is
 * unreliable (it can miss the calorie target by half). Rescale portions so
 * the meal lands on the targets, keeping the dish's proportions.
 */
export function calibrateMeal(
    ingredients: MealIngredient[],
    targets: CalibrationTargets,
): MealIngredient[] {
    const current = getMealTotals(ingredients);

    if (current.calories <= 0 || targets.calories <= 0) return ingredients;

    const uniform = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, targets.calories / current.calories),
    );
    const scaleFor =
        (targets.proteinPercentage !== undefined &&
            solveTwoGroupScale(
                ingredients,
                targets.calories,
                targets.proteinPercentage / 100,
            )) ||
        (() => uniform);

    const scaled = ingredients.map((ingredient) => ({
        ...ingredient,
        weight: roundWeight(ingredient.weight * scaleFor(ingredient)),
    }));

    return fineTune(scaled, targets.calories);
}

/*
 * Rounding can leave the meal a little off; nudge one portion at a time by
 * its rounding step, always picking the change that gets closest, until
 * within tolerance.
 */
function fineTune(ingredients: MealIngredient[], target: number) {
    const result = ingredients.map((i) => ({ ...i }));

    for (let attempt = 0; attempt < 40; attempt++) {
        const diff = target - getMealTotals(result).calories;

        if (Math.abs(diff) <= target * CALORIE_TOLERANCE) break;

        let best: { index: number; weight: number; error: number } | null =
            null;

        result.forEach((ingredient, index) => {
            const step = ingredient.weight < 20 ? 1 : 5;
            const weight = ingredient.weight + Math.sign(diff) * step;

            if (weight < 1) return;

            const error = Math.abs(
                diff - (kcal(ingredient, weight) - kcal(ingredient)),
            );

            if (!best || error < best.error) {
                best = { index, weight, error };
            }
        });

        if (!best) break;

        const { index, weight } = best;
        result[index].weight = weight;
    }

    return result;
}
