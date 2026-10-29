import type { FixedAmount, IngredientNutrition } from '../types/types.ts';

/**
 * A whole-meal nutrition goal the cook stated out loud, e.g. "30% protein",
 * "40 grams of protein" or "600 calories total".
 *
 * Kept separate from `MealRequirements` because it is raw speech, not a resolved
 * request. `unit: '%'` means a share of the meal's energy. A figure tied to one
 * food ("500 calories of bread") is not a target; it is that ingredient's
 * `quantity`.
 */
export type SpokenTarget = {
    nutrient: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'sugar' | 'sodium' | 'cholesterol';
    amount: number;
    unit: '%' | 'g' | 'mg' | 'kcal';
};

/** A fixed amount of one ingredient, e.g. "100 grams of rice" or "500 calories of bread". */
export type SpokenQuantity = FixedAmount;

/**
 * The confidence model's estimate that the match is the food the cook meant
 * (db/lab/confidence.mjs). `p` is 0-1; `band` is the model's label for it.
 */
export type MatchCertainty = { p: number; band: string };

/** One ingredient read out of a spoken request. */
export type ParsedIngredient = {
    /** The name as the cook said it. */
    said: string;
    /** The matched database food, or null when nothing was found. */
    match: (IngredientNutrition & { fdcId: number; description: string }) | null;
    /** Other plausible matches, best first, so the UI can offer a correction. */
    alternatives: (IngredientNutrition & { fdcId: number; description: string })[];
    /** How sure the match is, from the resolver's tier. */
    confidence: 'confident' | 'ambiguous' | 'probable' | 'weak' | null;
    /** A fixed amount the cook asked for, or null to let the generator choose. */
    quantity: SpokenQuantity | null;
    /** Estimated chance the match is right, or null when it could not be worked out. */
    certainty: MatchCertainty | null;
};

/**
 * A meal period named out loud, e.g. "breakfast" or "something for dinner".
 *
 * `mealType` matches `MealType` and the default slot ids, so it can be used
 * directly to pick a plan slot. `said` is the word actually used, so the UI can
 * echo it rather than assuming the canonical name.
 */
export type SpokenMealPeriod = {
    mealType: 'breakfast' | 'lunch' | 'snack' | 'dinner';
    said: string;
};

/** POST /api/parse-recipe { text } → this. */
export type ParseRecipeResponse = {
    ingredients: ParsedIngredient[];
    targets: SpokenTarget[];
    /** The meal period named in the request, or null when none was said. */
    mealPeriod: SpokenMealPeriod | null;
    /** True when the model had to be consulted to split or correct the input. */
    usedModel: boolean;
};
