// Client access to POST /api/parse-recipe.
//
// Turns what a cook said into ingredients with per-100 g nutrition read from the
// local database, plus any nutrition figures they stated. The server decides
// when to consult the model, so this is a single call.
import type {
    ParsedIngredient,
    ParseRecipeResponse,
    SpokenMealPeriod,
    SpokenTarget,
} from '../../shared/types/spoken';

export type { ParsedIngredient, ParseRecipeResponse, SpokenMealPeriod, SpokenTarget };

export type ParseRecipeResult =
    | { ok: true; data: ParseRecipeResponse }
    | { ok: false; message: string };

/* Matches the pattern in generateMealService: never throws, so callers can
   render an error rather than crash a render. */
export async function parseRecipe(
    text: string,
    signal?: AbortSignal,
): Promise<ParseRecipeResult> {
    try {
        const response = await fetch('/api/parse-recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal,
        });

        const payload = (await response.json().catch(() => null)) as
            | ParseRecipeResponse
            | { error?: { message?: string } }
            | null;

        if (!response.ok) {
            const message =
                (payload as { error?: { message?: string } } | null)?.error?.message;
            return { ok: false, message: message ?? 'Could not read those ingredients.' };
        }

        if (!payload || !Array.isArray((payload as ParseRecipeResponse).ingredients)) {
            return { ok: false, message: 'The server returned an unexpected reply.' };
        }

        return { ok: true, data: payload as ParseRecipeResponse };
    } catch (error) {
        // An aborted request is a superseded keystroke, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') {
            return { ok: false, message: '' };
        }
        return { ok: false, message: 'Could not reach the server.' };
    }
}
