import type {
    NutritionSearchResponse,
    NutritionSearchResult,
} from '../../shared/types/types';

/* USDA lookup via the server. Throws on a non-OK response so callers can
   decide how to degrade (the UI simply hides the USDA group). */
export async function searchNutrition(
    query: string,
    signal?: AbortSignal,
): Promise<NutritionSearchResult[]> {
    const response = await fetch(
        `/api/nutrition?q=${encodeURIComponent(query.trim())}`,
        { signal },
    );

    if (!response.ok) {
        throw new Error(`Nutrition search failed (${response.status})`);
    }

    const data = (await response.json()) as NutritionSearchResponse;
    return Array.isArray(data.results) ? data.results : [];
}
