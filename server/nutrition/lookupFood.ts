import type { IngredientNutrition } from '../../shared/types/types.ts';
import { foodSearchQuery, matchesFoodDescription } from './foodMatching.js';
import { getFoodDetail, resolveFood } from './mealmaker/client.js';
import { mapMealMakerFoodToIngredientNutrition } from './mealmaker/mapper.js';

async function lookupWithMealMakerApi(
    name: string,
): Promise<IngredientNutrition> {
    const food = await resolveFood(foodSearchQuery(name));
    // Synonym hits (capsicum -> peppers) fail the token check and can be tiered ambiguous.
    if (
        !food ||
        (food.match.tier !== 'confident' &&
            food.match.tier !== 'probable' &&
            !food.match.matchedVia?.startsWith('synonym:') &&
            !matchesFoodDescription(name, food.description) &&
            !(food.name && matchesFoodDescription(name, food.name)))
    ) {
        throw new Error(`No matching food found for ingredient: "${name}"`);
    }
    // Micronutrients only come with the detail record; macros still work without it.
    const detail = await getFoodDetail(food.fdcId).catch((error) => {
        console.warn(`Food detail unavailable for "${name}":`, error);
        return undefined;
    });
    return mapMealMakerFoodToIngredientNutrition(food, detail);
}

// Food data barely changes, while each provider round trip takes about a
// second. Keep recent matches in memory (per server instance) and share
// requests already in flight. Failures are never cached.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 500;
const cache = new Map<
    string,
    { savedAt: number; nutrition: Promise<IngredientNutrition> }
>();

export function clearFoodLookupCache() {
    cache.clear();
}

/** Looks up an ingredient's per-100g nutrition with the Nutrition Lab API. */
export function lookupFoodNutrition(
    name: string,
): Promise<IngredientNutrition> {
    const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.savedAt < CACHE_TTL_MS) {
        // Refresh recency so frequently used foods stay cached.
        cache.delete(key);
        cache.set(key, hit);
        return hit.nutrition;
    }
    const nutrition = lookupWithMealMakerApi(name).catch((error: unknown) => {
        if (cache.get(key)?.nutrition === nutrition) cache.delete(key);
        throw error;
    });
    cache.delete(key);
    cache.set(key, { savedAt: Date.now(), nutrition });
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    return nutrition;
}
