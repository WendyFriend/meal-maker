import { useCallback, useEffect, useRef, useState } from 'react';
import type { IngredientMatch } from '../../shared/types/types';
import {
    fetchIngredientMatches,
    getCachedMatch,
} from '../services/matchService';
import { normalizeIngredientName } from '../utils/Ingredient';

export const MATCH_DEBOUNCE_MS = 400;

/*
 * Closest-USDA-food lookup for the ingredients a meal is being made from.
 * Lookups are debounced and batched into one request; a newer batch aborts
 * the stale one. Results live in a module-level cache (see matchService), so
 * `getMatch` is: a match, `null` (no match found or the lookup failed), or
 * `undefined` (not looked up yet).
 */
export function useIngredientMatches(names: string[]) {
    // Names whose lookup failed or came back empty; the cache holds the rest.
    const [unmatched, setUnmatched] = useState<Set<string>>(() => new Set());
    // Starts the pending lookup right away, skipping the debounce.
    const flushRef = useRef<(() => Promise<void>) | null>(null);

    const pending = names.filter((name) => {
        const key = normalizeIngredientName(name);

        return !unmatched.has(key) && getCachedMatch(name) === undefined;
    });
    const pendingKey = pending.map(normalizeIngredientName).join('\n');

    useEffect(() => {
        if (!pendingKey) return;

        const batch = pending;
        const controller = new AbortController();
        let request: Promise<void> | undefined;

        const run = () => {
            window.clearTimeout(timer);
            request ??= fetchIngredientMatches(batch, controller.signal)
                .then((found) => {
                    if (controller.signal.aborted) return;
                    // Names the server didn't answer for have no match.
                    const missed = batch
                        .map(normalizeIngredientName)
                        .filter((key) => !found.has(key));
                    // Re-render so cached matches show up.
                    setUnmatched((current) => new Set([...current, ...missed]));
                })
                .catch(() => {
                    if (controller.signal.aborted) return;
                    setUnmatched(
                        (current) =>
                            new Set([
                                ...current,
                                ...batch.map(normalizeIngredientName),
                            ]),
                    );
                });

            return request;
        };

        const timer: number = window.setTimeout(run, MATCH_DEBOUNCE_MS);
        flushRef.current = async () => {
            await run();
        };

        return () => {
            window.clearTimeout(timer);
            controller.abort();
            flushRef.current = null;
        };
        // `pending` is derived from `pendingKey`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingKey]);

    const getMatch = useCallback(
        (name: string): IngredientMatch | null | undefined => {
            const cached = getCachedMatch(name);

            if (cached) return cached;

            return unmatched.has(normalizeIngredientName(name))
                ? null
                : undefined;
        },
        [unmatched],
    );

    /* Resolves once the pending lookup (if any) has finished. */
    const settle = useCallback(async () => {
        await flushRef.current?.();
    }, []);

    return { getMatch, isMatching: pending.length > 0, settle };
}
