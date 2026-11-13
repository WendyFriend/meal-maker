import {
    MICRONUTRIENTS,
    type MicronutrientValues,
} from '../../shared/micronutrients';
import type { IngredientInfo } from '../../shared/types/types';
import { loadMealGenerator } from '../settings/mealGenerator';

export const micronutrientLookupKey = (name: string) =>
    name.trim().toLowerCase();

export function hasMicronutrientValue(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function needsMicronutrients(ingredient: MicronutrientValues): boolean {
    const unavailable = ingredient.unavailableMicronutrients ?? [];
    return MICRONUTRIENTS.some(
        ({ key }) =>
            !unavailable.includes(key) &&
            !hasMicronutrientValue(ingredient[key]),
    );
}

// Food reference values can be reused across recipes and app restarts. Keep the
// provider in the key so switching generators never mixes their results.
const CACHE_KEY = 'meal-maker:ingredient-nutrition:v1';
const CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 80;
type CachedNutrition = { savedAt: number; ingredient: IngredientInfo };
const resolvedLookups = new Map<string, CachedNutrition>();
const lookups = new Map<string, Promise<IngredientInfo>>();

function readStoredLookups(): Record<string, CachedNutrition> {
    try {
        const value = window.localStorage.getItem(CACHE_KEY);
        if (!value) return {};
        const parsed: unknown = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, CachedNutrition>)
            : {};
    } catch {
        return {};
    }
}

function cachedNutrition(key: string): IngredientInfo | undefined {
    const entry = resolvedLookups.get(key) ?? readStoredLookups()[key];
    if (
        !entry ||
        typeof entry.savedAt !== 'number' ||
        Date.now() - entry.savedAt >= CACHE_AGE_MS ||
        typeof entry.ingredient?.name !== 'string'
    ) {
        resolvedLookups.delete(key);
        return undefined;
    }
    resolvedLookups.set(key, entry);
    return entry.ingredient;
}

export function getCachedIngredientNutrition(
    name: string,
): IngredientInfo | undefined {
    return cachedNutrition(
        `${loadMealGenerator()}:${micronutrientLookupKey(name)}`,
    );
}

function storeNutrition(key: string, ingredient: IngredientInfo) {
    const entry = { savedAt: Date.now(), ingredient };
    resolvedLookups.set(key, entry);
    if (resolvedLookups.size > CACHE_LIMIT)
        resolvedLookups.delete(resolvedLookups.keys().next().value!);
    try {
        const stored = readStoredLookups();
        stored[key] = entry;
        const recent = Object.entries(stored)
            .filter(
                ([, value]) =>
                    typeof value?.savedAt === 'number' &&
                    Date.now() - value.savedAt < CACHE_AGE_MS,
            )
            .sort(([, a], [, b]) => a.savedAt - b.savedAt)
            .slice(-CACHE_LIMIT);
        window.localStorage.setItem(
            CACHE_KEY,
            JSON.stringify(Object.fromEntries(recent)),
        );
    } catch {
        // Browsers can disable storage; the in-memory cache still works.
    }
}

export function getIngredientNutrition(name: string): Promise<IngredientInfo> {
    const generator = loadMealGenerator();
    const key = `${generator}:${micronutrientLookupKey(name)}`;
    const resolved = cachedNutrition(key);
    if (resolved) return Promise.resolve(resolved);
    const cached = lookups.get(key);
    if (cached) return cached;
    const request = fetch('/api/ingredient-nutrition', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Meal-Generator': generator,
        },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(15_000),
    })
        .then(async (response) => {
            if (!response.ok)
                throw new Error('Ingredient micronutrients are unavailable');
            const data: unknown = await response.json();
            if (!data || typeof data !== 'object')
                throw new Error('Invalid micronutrient response');
            const source = data as IngredientInfo;
            return {
                name:
                    typeof source.name === 'string' && source.name.trim()
                        ? source.name
                        : name,
                caloriesPer100g: source.caloriesPer100g,
                proteinPer100g: source.proteinPer100g,
                carbohydratePer100g: source.carbohydratePer100g,
                fatPer100g: source.fatPer100g,
                sugarPer100g: source.sugarPer100g,
                saturatedFatPer100g: source.saturatedFatPer100g,
                fiberPer100g: source.fiberPer100g,
                ...Object.fromEntries(
                    MICRONUTRIENTS.map(({ key }) => [
                        key,
                        hasMicronutrientValue(source[key])
                            ? source[key]
                            : undefined,
                    ]),
                ),
                nutritionSource: source.nutritionSource,
                unavailableMicronutrients: source.unavailableMicronutrients,
                resolvedName: source.resolvedName,
            };
        })
        .then((ingredient) => {
            storeNutrition(key, ingredient);
            lookups.delete(key);
            return ingredient;
        })
        .catch((error: unknown) => {
            lookups.delete(key);
            throw error;
        });
    if (lookups.size >= 100) lookups.delete(lookups.keys().next().value!);
    lookups.set(key, request);
    return request;
}
