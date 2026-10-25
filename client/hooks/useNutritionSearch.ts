import { useEffect, useState } from 'react';
import type { NutritionSearchResult } from '../../shared/types/types';
import { searchNutrition } from '../services/nutritionService';

export const NUTRITION_SEARCH_DEBOUNCE_MS = 300;
export const NUTRITION_SEARCH_MIN_CHARS = 2;

/*
 * Debounced, abortable USDA lookup for a search box. Failures (404/502, no
 * network) just yield no results so the UI degrades to its normal behaviour.
 */
export function useNutritionSearch(query: string, enabled = true) {
    const trimmed = query.trim();
    const active = enabled && trimmed.length >= NUTRITION_SEARCH_MIN_CHARS;
    const [state, setState] = useState<{
        query: string;
        results: NutritionSearchResult[];
    }>({ query: '', results: [] });

    useEffect(() => {
        if (!active) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            searchNutrition(trimmed, controller.signal)
                .then((results) => setState({ query: trimmed, results }))
                .catch(() => {
                    if (!controller.signal.aborted)
                        setState({ query: trimmed, results: [] });
                });
        }, NUTRITION_SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [active, trimmed]);

    // Results belong to the query that produced them; hide stale ones.
    const results = active && state.query === trimmed ? state.results : [];
    const isLoading = active && state.query !== trimmed;

    return { results, isLoading };
}
