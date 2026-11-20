const MEAL_PREFERENCES_KEY = 'meal-maker:dev-show-meal-preferences';

/** Developer settings appear on Profile in local development only. */
export const showDeveloperSettings = import.meta.env.DEV;

/**
 * Meal Maker's four preference chips are in progress. Production hides them
 * (VITE_FEATURE_MEAL_PREFERENCES=true shows them, e.g. on a Vercel Preview);
 * in development, Profile's switch decides, on by default.
 */
export function mealPreferencesEnabled() {
    if (!import.meta.env.DEV)
        return import.meta.env.VITE_FEATURE_MEAL_PREFERENCES === 'true';
    try {
        return localStorage.getItem(MEAL_PREFERENCES_KEY) !== 'false';
    } catch {
        return true;
    }
}

export function setMealPreferencesEnabled(enabled: boolean) {
    try {
        localStorage.setItem(MEAL_PREFERENCES_KEY, String(enabled));
    } catch {
        // Storage blocked: the switch resets on reload.
    }
}
