import { useEffect } from 'react';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
} from '../services/micronutrientService';

/**
 * Typing pause before the lookup starts. It matches the suggestion search,
 * so nutrition is on its way by the time suggestions appear.
 */
export const PREFETCH_DELAY_MS = 250;

/**
 * Starts an ingredient's nutrition lookup once the user pauses typing, so it
 * is usually done (or in flight) by the time they press Enter. The service
 * shares in-flight requests, so committing the name never asks twice.
 */
export function usePrefetchIngredientNutrition(name: string, enabled: boolean) {
    useEffect(() => {
        const trimmed = name.trim();
        if (
            !enabled ||
            trimmed.length < 3 ||
            // A trailing space means another word is coming.
            /\s$/.test(name) ||
            getCachedIngredientNutrition(trimmed)
        )
            return;
        const timer = window.setTimeout(() => {
            // A failed prefetch is retried when the name is committed.
            void getIngredientNutrition(trimmed).catch(() => undefined);
        }, PREFETCH_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [name, enabled]);
}
