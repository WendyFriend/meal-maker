import type {
    FoodSuggestion,
    FoodSuggestionsResponse,
    ParseIngredientsResponse,
} from '../../shared/types/types';

/* Nutrition Lab search via the server. Throws on a non-OK response so callers
   can degrade (the dropdown simply shows saved ingredients only). */
export async function searchFoodSuggestions(
    query: string,
    signal?: AbortSignal,
): Promise<FoodSuggestion[]> {
    const response = await fetch(
        `/api/food-suggestions?q=${encodeURIComponent(query.trim())}`,
        { signal },
    );
    if (!response.ok) {
        throw new Error(`Food search failed (${response.status})`);
    }
    const data = (await response.json()) as FoodSuggestionsResponse;
    return Array.isArray(data.results) ? data.results : [];
}

// List separators, or "and"/"with"/"plus" between words.
const SEPARATORS = /\s*(?:[,;+&\n]|\s(?:and|with|plus)\s)\s*/i;

/** True when typed text lists foods with separators, e.g. "chicken and rice". */
export function looksLikeSeveralIngredients(text: string): boolean {
    return SEPARATORS.test(text.trim());
}

function splitLocally(text: string): string[] {
    return text
        .split(new RegExp(SEPARATORS.source, 'gi'))
        .map((part) => part.trim())
        .filter(Boolean);
}

/**
 * Turns typed text into database food names, one per food. The server asks
 * the Nutrition Lab, which names "tomato" as "Tomatoes, red, ripe", separates
 * "tomato potato" and repairs misspellings; if it is unavailable, a plain
 * split on separators is used instead.
 */
export async function parseIngredientNames(text: string): Promise<string[]> {
    try {
        const response = await fetch('/api/parse-ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error('Ingredient parsing failed');
        const data = (await response.json()) as ParseIngredientsResponse;
        if (Array.isArray(data.ingredients) && data.ingredients.length > 0) {
            return data.ingredients;
        }
    } catch {
        // Fall through to the local split.
    }
    return splitLocally(text);
}
