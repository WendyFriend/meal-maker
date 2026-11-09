import {
    DEFAULT_MEAL_GENERATOR,
    MEAL_GENERATORS,
    type MealGenerator,
} from '../../shared/types/types';

const STORAGE_KEY = 'meal-maker:meal-generator';

export function loadMealGenerator(): MealGenerator {
    // Production has a single supported provider. Development retains the
    // local override so the alternative pipeline remains easy to test.
    if (!import.meta.env.DEV) return DEFAULT_MEAL_GENERATOR;
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return (
            MEAL_GENERATORS.find((generator) => generator === stored) ??
            DEFAULT_MEAL_GENERATOR
        );
    } catch {
        return DEFAULT_MEAL_GENERATOR;
    }
}

export function saveMealGenerator(generator: MealGenerator) {
    try {
        window.localStorage.setItem(STORAGE_KEY, generator);
    } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this session only.
    }
}
