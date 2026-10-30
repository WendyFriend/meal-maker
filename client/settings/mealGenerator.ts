import { MEAL_GENERATORS, type MealGenerator } from '../../shared/types/types';

const STORAGE_KEY = 'meal-maker:meal-generator';

export const DEFAULT_MEAL_GENERATOR: MealGenerator = 'ollama';

export function loadMealGenerator(): MealGenerator {
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
