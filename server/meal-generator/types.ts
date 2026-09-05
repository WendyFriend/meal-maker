/**
 * Number of coordinate-descent iterations used to find
 * the continuous approximation.
 */
export const MAX_CONTINUOUS_ITERATIONS = 500;

export const MIN_AMOUNT = 0;
export const MAX_AMOUNT = 5000;

export const MIN_INGREDIENT_AMOUNT = 5;
export const MAX_INGREDIENT_AMOUNT = 500;
/**
 * Numerical tolerance for deciding whether the continuous
 * optimization has converged.
 */
export const CONTINUOUS_TOLERANCE = 1e-8;

export const DEFAULT_CALORIES = 600;
export const DEFAULT_PROTEIN_PERCENTAGE = 30;

export const AMOUNT_STEP = 5;

/**
 * Search radius around the continuous solution.
 *
 * For example, radius = 50 means that if the continuous
 * solution contains 173g, the discrete search considers
 * approximately 120g .. 225g in 5g increments.
 */
export const DEFAULT_SEARCH_RADIUS = 50;

export type SearchRange = {
    values: number[];
    min: number;
    max: number;
};
