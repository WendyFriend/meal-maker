import type { DailyTargets, MealSlotConfig } from '../../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import type { MealType } from '../../shared/types/types';
import {
    NUTRIENTS,
    sumMicronutrients,
    type Micronutrients,
    type NutrientDefinition,
    type NutrientKey,
} from '../../shared/nutrition/nutrients';

/*
 * Pure planner maths: what a day's entries add up to, and how much of the
 * rest of the day's budget a meal period should aim for.
 */

/* Same fields as the daily targets, so totals compare directly. */
export type NutritionTotals = DailyTargets;

/* A planned entry with the recipe it points at. */
export type PlannedMeal = {
    entry: MealPlanEntry;
    recipe: Recipe;
};

export type SlotBudget = {
    // Suggested size of the next meal in the period.
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    // % of the meal's energy that should come from protein.
    proteinPercentage: number;
    mealType: MealType;
    // Calories already planned in this period.
    plannedCalories: number;
    // Day targets minus everything planned so far (can go negative).
    remaining: NutritionTotals;
};

export const MIN_SLOT_CALORIES = 150;
export const MAX_SLOT_CALORIES = 1500;
export const MIN_PROTEIN_PERCENTAGE = 10;
export const MAX_PROTEIN_PERCENTAGE = 60;
// A nutrient is "low" for the day below this share of its target.
export const LOW_NUTRIENT_PERCENT = 75;

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const EMPTY_TOTALS: NutritionTotals = {
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

/* Nutrition of one serving of a recipe (weights are per serving). */
export function getRecipeNutrition(
    recipe: Pick<Recipe, 'ingredients'>,
): NutritionTotals {
    return recipe.ingredients.reduce<NutritionTotals>(
        (totals, ingredient) => {
            const factor = ingredient.weight / 100;
            const fiber =
                ingredient.fiberPer100g ??
                ingredient.micronutrientsPer100g?.fiber ??
                0;

            return {
                calories: totals.calories + ingredient.caloriesPer100g * factor,
                proteinG: totals.proteinG + ingredient.proteinPer100g * factor,
                carbsG: totals.carbsG + ingredient.carbohydratePer100g * factor,
                fatG: totals.fatG + ingredient.fatPer100g * factor,
                fiberG: totals.fiberG + fiber * factor,
            };
        },
        { ...EMPTY_TOTALS },
    );
}

export function scaleNutrition(
    totals: NutritionTotals,
    factor: number,
): NutritionTotals {
    return {
        calories: totals.calories * factor,
        proteinG: totals.proteinG * factor,
        carbsG: totals.carbsG * factor,
        fatG: totals.fatG * factor,
        fiberG: totals.fiberG * factor,
    };
}

/* Nutrition of a planned entry: one serving times the portions eaten. */
export function getEntryNutrition({
    entry,
    recipe,
}: PlannedMeal): NutritionTotals {
    return scaleNutrition(getRecipeNutrition(recipe), entry.servings);
}

export function sumNutrition(meals: PlannedMeal[]): NutritionTotals {
    return meals.reduce<NutritionTotals>(
        (totals, meal) => {
            const nutrition = getEntryNutrition(meal);

            return {
                calories: totals.calories + nutrition.calories,
                proteinG: totals.proteinG + nutrition.proteinG,
                carbsG: totals.carbsG + nutrition.carbsG,
                fatG: totals.fatG + nutrition.fatG,
                fiberG: totals.fiberG + nutrition.fiberG,
            };
        },
        { ...EMPTY_TOTALS },
    );
}

/* Vitamins, minerals etc. across the meals, scaled by portions eaten. */
export function sumDayMicronutrients(meals: PlannedMeal[]): Micronutrients {
    return sumMicronutrients(
        meals.flatMap(({ entry, recipe }) =>
            recipe.ingredients.map((ingredient) => ({
                weight: ingredient.weight * entry.servings,
                micronutrientsPer100g: ingredient.micronutrientsPer100g,
            })),
        ),
    );
}

export function subtractNutrition(
    targets: NutritionTotals,
    planned: NutritionTotals,
): NutritionTotals {
    return {
        calories: targets.calories - planned.calories,
        proteinG: targets.proteinG - planned.proteinG,
        carbsG: targets.carbsG - planned.carbsG,
        fatG: targets.fatG - planned.fatG,
        fiberG: targets.fiberG - planned.fiberG,
    };
}

/* Periods ordered by time of day; periods without a time go last. */
export function sortSlots(slots: MealSlotConfig[]): MealSlotConfig[] {
    return slots
        .map((slot, index) => ({ slot, index }))
        .sort((a, b) => {
            const timeA = a.slot.time || '99:99';
            const timeB = b.slot.time || '99:99';

            return timeA.localeCompare(timeB) || a.index - b.index;
        })
        .map(({ slot }) => slot);
}

/* breakfast/lunch/dinner/snack ids map directly; custom periods are judged
   by their time of day (and name, if they have no time). */
export function inferMealType(slot: MealSlotConfig): MealType {
    if (MEAL_TYPES.includes(slot.id as MealType)) {
        return slot.id as MealType;
    }

    if (!slot.time) {
        const named = MEAL_TYPES.find((type) =>
            slot.label.toLowerCase().includes(type),
        );

        return named ?? 'snack';
    }

    if (slot.time < '10:30') return 'breakfast';
    if (slot.time < '14:30') return 'lunch';
    if (slot.time < '17:00') return 'snack';

    return 'dinner';
}

/* Calories a period gets from its share of the daily target. */
export function getSlotShareCalories(
    targets: DailyTargets,
    slot: MealSlotConfig,
) {
    return Math.round((targets.calories * slot.calorieShare) / 100);
}

type SlotBudgetInput = {
    targets: DailyTargets;
    slots: MealSlotConfig[];
    slot: MealSlotConfig;
    // Everything planned that day, in every period.
    meals: PlannedMeal[];
};

/*
 * What the next meal in `slot` should aim for.
 *
 * - Empty period: the day's remaining calories, split between the periods
 *   that are still empty (this one included) by their calorieShare.
 * - Period with meals: its share of the daily target minus what is in it.
 * Either way the result is rounded to 10 kcal and kept to 150-1500 kcal.
 *
 * Protein is the day's remaining protein energy as a share of its
 * remaining calories (10-60%, the targets' own ratio once the day is
 * full); the rest of the meal's energy is split between carbs and fat in
 * the ratio the day still needs.
 */
export function getSlotBudget({
    targets,
    slots,
    slot,
    meals,
}: SlotBudgetInput): SlotBudget {
    const remaining = subtractNutrition(targets, sumNutrition(meals));
    const inSlot = meals.filter(({ entry }) => entry.slot === slot.id);
    const plannedCalories = sumNutrition(inSlot).calories;

    let rawCalories: number;

    if (inSlot.length > 0) {
        rawCalories = getSlotShareCalories(targets, slot) - plannedCalories;
    } else {
        const emptySlots = slots.filter(
            (other) =>
                other.id === slot.id ||
                !meals.some(({ entry }) => entry.slot === other.id),
        );
        const emptyShare = emptySlots.reduce(
            (total, other) => total + other.calorieShare,
            0,
        );
        const fraction =
            emptyShare > 0
                ? slot.calorieShare / emptyShare
                : 1 / Math.max(emptySlots.length, 1);

        rawCalories = remaining.calories * fraction;
    }

    const calories = clamp(
        Math.round(rawCalories / 10) * 10,
        MIN_SLOT_CALORIES,
        MAX_SLOT_CALORIES,
    );

    // Once the day is full, aim for the same mix the targets ask for.
    const basis = remaining.calories > 0 ? remaining : targets;
    const basisProtein = Math.max(0, basis.proteinG);
    const proteinPercentage = Math.round(
        clamp(
            (basisProtein * 4 * 100) / basis.calories,
            MIN_PROTEIN_PERCENTAGE,
            MAX_PROTEIN_PERCENTAGE,
        ),
    );

    const carbEnergy = Math.max(0, basis.carbsG) * 4;
    const fatEnergy = Math.max(0, basis.fatG) * 9;
    const carbShare =
        carbEnergy + fatEnergy > 0
            ? carbEnergy / (carbEnergy + fatEnergy)
            : (targets.carbsG * 4) /
              Math.max(targets.carbsG * 4 + targets.fatG * 9, 1);
    const nonProteinCalories = (calories * (100 - proteinPercentage)) / 100;
    const fiberFraction =
        remaining.calories > 0
            ? Math.min(1, calories / remaining.calories)
            : calories / targets.calories;

    return {
        calories,
        proteinG: Math.round((calories * proteinPercentage) / 100 / 4),
        carbsG: Math.round((nonProteinCalories * carbShare) / 4),
        fatG: Math.round((nonProteinCalories * (1 - carbShare)) / 9),
        fiberG: Math.round(Math.max(0, remaining.fiberG) * fiberFraction),
        proteinPercentage,
        mealType: inferMealType(slot),
        plannedCalories: Math.round(plannedCalories),
        remaining,
    };
}

/* How a total is going against its target: nothing yet, short of it, about
   there (within 10%) or over. */
export function getProgressTone(value: number, target: number) {
    if (target <= 0 || value <= 0) return 'empty';

    const ratio = value / target;

    if (ratio > 1.1) return 'over';
    if (ratio >= 0.9) return 'on';

    return 'under';
}

/* Whether a meal stays within a period's budget (up to 10% over). */
export function fitsBudget(calories: number, budgetCalories: number) {
    return calories <= budgetCalories * 1.1;
}

export type NutrientProgress = {
    key: NutrientKey;
    label: string;
    unit: NutrientDefinition['unit'];
    group: NutrientDefinition['group'];
    amount: number;
    // Target for the day: the user's own for fibre, else the Daily Value.
    target?: number;
    percent?: number;
    // Keep under the target rather than reach it.
    limit: boolean;
    // False when no planned ingredient reported this nutrient.
    reported: boolean;
};

/* Day totals for every tracked nutrient, as a share of its target. */
export function getNutrientProgress(
    totals: NutritionTotals,
    micronutrients: Micronutrients,
    targets: DailyTargets,
): NutrientProgress[] {
    return NUTRIENTS.map((nutrient) => {
        const isFiber = nutrient.key === 'fiber';
        const reported = isFiber || micronutrients[nutrient.key] !== undefined;
        const amount = isFiber
            ? totals.fiberG
            : (micronutrients[nutrient.key] ?? 0);
        const target = isFiber ? targets.fiberG : nutrient.dailyValue;

        return {
            key: nutrient.key,
            label: nutrient.label,
            unit: nutrient.unit,
            group: nutrient.group,
            amount,
            target,
            percent: target ? Math.round((amount / target) * 100) : undefined,
            limit: nutrient.limit ?? false,
            reported,
        };
    });
}

/*
 * Labels of the nutrients the day is furthest below target on, for the
 * recommendation to lean towards. Fibre is always considered; the others
 * only when a planned ingredient reports them (an unreported nutrient is
 * unknown, not zero).
 */
export function getFocusNutrients({
    targets,
    meals,
    max = 4,
}: {
    targets: DailyTargets;
    meals: PlannedMeal[];
    max?: number;
}): string[] {
    const micronutrients = sumDayMicronutrients(meals);
    const hasMicronutrientData = Object.keys(micronutrients).some(
        (key) => key !== 'fiber',
    );

    return getNutrientProgress(sumNutrition(meals), micronutrients, targets)
        .filter(
            (nutrient) =>
                !nutrient.limit &&
                nutrient.percent !== undefined &&
                (nutrient.key === 'fiber' || hasMicronutrientData) &&
                nutrient.reported,
        )
        .filter((nutrient) => (nutrient.percent ?? 0) < LOW_NUTRIENT_PERCENT)
        .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
        .slice(0, max)
        .map((nutrient) => nutrient.label);
}
