export const MIN_SERVINGS = 0.5;
export const MAX_SERVINGS = 3;
export const SERVINGS_STEP = 0.5;

export const SERVING_OPTIONS = Array.from(
    { length: (MAX_SERVINGS - MIN_SERVINGS) / SERVINGS_STEP + 1 },
    (_, index) => MIN_SERVINGS + index * SERVINGS_STEP,
);

/* 1 -> "1", 1.5 -> "1.5" */
export function formatServings(servings: number) {
    return String(Number(servings.toFixed(2)));
}
