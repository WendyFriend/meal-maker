import type {
    IngredientMatch,
    MatchIngredientsResponse,
} from '../../shared/types/types';
import { normalizeIngredientName } from '../utils/Ingredient';

// A lookup that hangs shouldn't hold up the meal; callers then fall back to
// letting the AI estimate.
const MATCH_TIMEOUT_MS = 10_000;

// Matches by normalized ingredient name. USDA data doesn't change within a
// session, so a name is only ever looked up once.
const cache = new Map<string, IngredientMatch>();

export function getCachedMatch(name: string): IngredientMatch | undefined {
    return cache.get(normalizeIngredientName(name));
}

export function clearMatchCache() {
    cache.clear();
}

/*
 * POST /api/match-ingredients: the closest USDA food for each name, with
 * alternatives. Only names missing from the cache are requested. Resolves
 * with the matches for the requested names keyed by normalized name; throws
 * on a failed or aborted request so callers can fall back to AI estimates.
 */
export async function fetchIngredientMatches(
    names: string[],
    signal?: AbortSignal,
): Promise<Map<string, IngredientMatch>> {
    const found = new Map<string, IngredientMatch>();
    const missing: string[] = [];

    for (const name of names) {
        const key = normalizeIngredientName(name);
        const cached = cache.get(key);

        if (cached) found.set(key, cached);
        else if (!missing.some((m) => normalizeIngredientName(m) === key))
            missing.push(name.trim());
    }

    if (missing.length === 0) return found;

    // Abort on the caller's signal or the timeout, whichever comes first.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), MATCH_TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);

    try {
        const response = await fetch('/api/match-ingredients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: missing }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Ingredient match failed (${response.status})`);
        }

        const data = (await response.json()) as MatchIngredientsResponse;
        const matches = Array.isArray(data.matches) ? data.matches : [];

        matches.forEach((match, index) => {
            const key = normalizeIngredientName(
                match.query ?? missing[index] ?? '',
            );
            if (!key) return;

            const normalized: IngredientMatch = {
                ...match,
                alternatives: Array.isArray(match.alternatives)
                    ? match.alternatives
                    : [],
            };
            cache.set(key, normalized);
            found.set(key, normalized);
        });

        return found;
    } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}
