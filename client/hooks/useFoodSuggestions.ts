import { useEffect, useState } from 'react';
import type { FoodSuggestion } from '../../shared/types/types';
import { searchFoodSuggestions } from '../services/foodSearchService';

export const FOOD_SUGGESTIONS_DEBOUNCE_MS = 300;
export const FOOD_SUGGESTIONS_MIN_CHARS = 2;

/*
 * Debounced, abortable Nutrition Lab search for a search box. Failures just
 * yield no results so the dropdown falls back to saved ingredients.
 */
export function useFoodSuggestions(query: string, enabled = true) {
    const trimmed = query.trim();
    const active = enabled && trimmed.length >= FOOD_SUGGESTIONS_MIN_CHARS;
    const [state, setState] = useState<{
        query: string;
        results: FoodSuggestion[];
    }>({ query: '', results: [] });

    useEffect(() => {
        if (!active) return;

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            searchFoodSuggestions(trimmed, controller.signal)
                .then((results) => setState({ query: trimmed, results }))
                .catch(() => {
                    if (!controller.signal.aborted)
                        setState({ query: trimmed, results: [] });
                });
        }, FOOD_SUGGESTIONS_DEBOUNCE_MS);

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
