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

// Share successful/in-flight lookups between meal totals and ingredient details.
const lookups = new Map<string, Promise<IngredientInfo>>();

export function getIngredientNutrition(name: string): Promise<IngredientInfo> {
    const generator = loadMealGenerator();
    const key = `${generator}:${micronutrientLookupKey(name)}`;
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
        .catch((error: unknown) => {
            lookups.delete(key);
            throw error;
        });
    if (lookups.size >= 100) lookups.delete(lookups.keys().next().value!);
    lookups.set(key, request);
    return request;
}
