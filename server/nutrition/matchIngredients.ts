import type {
    IngredientMatch,
    MatchIngredientsRequest,
    MatchIngredientsResponse,
    NutritionSearchResult,
} from '../../shared/types/types.ts';
import {
    defaultSearchFoods,
    scoreFood,
    searchRankedFoods,
    type SearchFoods,
} from './searchNutrition.ts';
import type { USDAFood } from './usda/types.ts';

const MAX_NAMES = 20;
const MAX_ALTERNATIVES = 5;
// One best match plus its alternatives.
const CANDIDATES = MAX_ALTERNATIVES + 1;
const SEARCH_RETRIES = 2;
const RETRY_DELAY_MS = 400;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

// Words that describe the state or cut of a food rather than which food it
// is; dropped when the full phrase finds nothing in USDA.
const DESCRIPTOR_WORDS = new Set([
    'dried',
    'dry',
    'fresh',
    'raw',
    'uncooked',
    'organic',
    'chopped',
    'diced',
    'sliced',
    'minced',
    'large',
    'medium',
    'small',
    'boneless',
    'skinless',
    'free-range',
    'lean',
]);

// States that change the nutrition per 100 g a lot. Meal weights are raw,
// so these only win when the user asked for them by name.
const PREPARED_STATES =
    /\b(cooked|boiled|fried|roasted|baked|canned|frozen|drained|steamed|stewed|grilled|broiled|braised|toasted|pickled|sauteed|microwaved|prepared|reconstituted|restaurant|cream of|dehydrated|powder|flour|juice|sauce)\b/;

// Variants and products that are rarely what a bare ingredient name means;
// they only win when the user typed the word themselves.
const UNUSUAL_TERMS = [
    'smoked',
    'deli',
    'rotisserie',
    'prepackaged',
    'sliced',
    'seasoned',
    'fermented',
    'buttermilk',
    'sheep',
    'goat',
    'buffalo',
    'duck',
    'sprouted',
    'candied',
    'breaded',
    'flavor',
    'sweetened',
    'fruit',
    'vanilla',
    'strawberry',
    'blueberry',
    'chocolate',
    'honey',
    'dried',
    'dry',
    'nonfat',
    'fat free',
    'fat-free',
    'lowfat',
    'low fat',
    'grass-fed',
    'imported',
    'chunk style',
    'chunky',
    'giblets',
    'feet',
    'ground', // chicken, turkey: ground is a product, not the plain meat
];

// Common bare names that USDA spreads over many near-identical entries.
// Each maps to a search that lands on the plain, raw, everyday food.
const ALIASES: Record<string, string> = {
    chicken: 'chicken breast skinless boneless raw',
    'chicken breast': 'chicken breast skinless boneless raw',
    rice: 'rice white long-grain raw',
    egg: 'egg whole raw fresh',
    eggs: 'egg whole raw fresh',
    milk: 'milk whole',
    mushroom: 'mushrooms white raw',
    mushrooms: 'mushrooms white raw',
    'ground beef': 'beef ground 85% lean raw',
    salmon: 'salmon atlantic farmed raw',
    tofu: 'tofu raw firm',
    tomato: 'tomatoes red ripe raw',
    tomatoes: 'tomatoes red ripe raw',
};

function hasTerm(text: string, term: string): boolean {
    return new RegExp(`\\b${term}\\b`).test(text);
}

/* "  Chicken   Breast " → "chicken breast", the cache and match key. */
export function normalizeQuery(name: string): string {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

// "tomatoes" → "tomato", "berries" → "berry", but "hummus" stays.
function singular(word: string): string {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }

    return word;
}

function toWords(text: string): string[] {
    return normalizeQuery(text)
        .split(/[^a-z0-9%-]+/)
        .filter(Boolean)
        .map(singular);
}

/* The query with state/cut words removed, or the query itself if that
   would leave nothing. */
export function stripDescriptors(query: string): string {
    const kept = normalizeQuery(query)
        .split(' ')
        .filter((word) => !DESCRIPTOR_WORDS.has(word));

    return kept.length > 0 ? kept.join(' ') : normalizeQuery(query);
}

/*
 * Ranking for choosing the closest food: the text match from scoreFood,
 * plus credit for covering every query word (in any comma part, so
 * "cheddar" finds "Cheese, cheddar"), a preference for raw/plain foods
 * unless the user named a state, for SR Legacy entries (they report far
 * more nutrients than most Foundation ones) and for fuller records.
 */
export function scoreMatch(food: USDAFood, query: string): number {
    const text = food.description.toLowerCase();
    const queryText = normalizeQuery(query);
    const words = toWords(query);
    const textWords = new Set(toWords(text));
    const parts = text.split(',').map(toWords);
    let score = scoreFood(food.description, query);

    const hits = words.filter((word) => textWords.has(word)).length;
    score += (hits / Math.max(words.length, 1)) * 6;
    if (hits === words.length) score += 3;

    // The query is the whole of the leading name, or of the second part
    // ("Cheese, cheddar" for "cheddar").
    const isWholePart = (part: string[] | undefined) =>
        part !== undefined &&
        part.length === words.length &&
        words.every((word) => part.includes(word));
    if (isWholePart(parts[0])) score += 4;
    else if (isWholePart(parts[1])) score += 3;

    const wantsState = PREPARED_STATES.exec(queryText)?.[0];
    const foodState = PREPARED_STATES.exec(text)?.[0];

    if (foodState && foodState !== wantsState) score -= 6;
    for (const term of UNUSUAL_TERMS) {
        if (hasTerm(text, term) && !hasTerm(queryText, term)) score -= 5;
    }
    if (/\braw\b/.test(text) && !wantsState) score += 2;
    if (
        /\b(imitation|substitute|dietetic|low[- ]sodium|reduced)\b/.test(text)
    ) {
        score -= 2;
    }
    if (/bplainb/.test(text)) score += 1;
    if (food.dataType === 'SR Legacy') score += 2;
    score += Math.min(food.foodNutrients.length, 100) / 50;

    return score;
}

type CacheEntry = { at: number; match: IngredientMatch };
export type MatchCache = Map<string, CacheEntry>;

const defaultCache: MatchCache = new Map();

function readCache(cache: MatchCache, key: string, now: number) {
    const entry = cache.get(key);

    if (!entry) return undefined;
    if (now - entry.at > CACHE_TTL_MS) {
        cache.delete(key);
        return undefined;
    }

    return entry.match;
}

function writeCache(
    cache: MatchCache,
    key: string,
    match: IngredientMatch,
    now: number,
) {
    // Maps iterate in insertion order, so the first key is the oldest.
    while (cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
    cache.set(key, { at: now, match });
}

/* High when the chosen food's description covers every word the user
   typed (ignoring state words); otherwise the user should double-check. */
function getConfidence(
    query: string,
    match: NutritionSearchResult | null,
): IngredientMatch['confidence'] {
    if (!match) return 'low';

    const description = new Set(toWords(match.description));

    return toWords(stripDescriptors(query)).every((word) =>
        description.has(word),
    )
        ? 'high'
        : 'low';
}

// USDA now and then answers 503 under load; a retry or two is usually enough.
async function searchWithRetry(
    attempt: { query: string; requireAllWords: boolean },
    searchFoods: SearchFoods,
): Promise<NutritionSearchResult[]> {
    const search = () =>
        searchRankedFoods(attempt.query, searchFoods, {
            requireAllWords: attempt.requireAllWords,
            limit: CANDIDATES,
            rank: scoreMatch,
        });

    for (let retry = 1; retry <= SEARCH_RETRIES; retry++) {
        try {
            return await search();
        } catch {
            await new Promise((resolve) =>
                setTimeout(resolve, RETRY_DELAY_MS * retry),
            );
        }
    }

    return search();
}

async function lookUp(
    query: string,
    searchFoods: SearchFoods,
): Promise<NutritionSearchResult[]> {
    const stripped = stripDescriptors(query);
    const alias = Object.hasOwn(ALIASES, stripped)
        ? ALIASES[stripped]
        : undefined;
    const attempts = [
        ...(alias ? [{ query: alias, requireAllWords: true }] : []),
        { query, requireAllWords: true },
        ...(stripped !== query
            ? [{ query: stripped, requireAllWords: true }]
            : []),
        { query: stripped, requireAllWords: false },
    ];

    for (const attempt of attempts) {
        const results = await searchWithRetry(attempt, searchFoods);

        if (results.length > 0) return results;
    }

    return [];
}

/*
 * The USDA food closest to what the user typed, plus alternatives. Throws
 * if USDA can't be reached. Results are cached by normalised query.
 */
export async function matchIngredient(
    name: string,
    searchFoods: SearchFoods = defaultSearchFoods,
    cache: MatchCache = defaultCache,
    now: number = Date.now(),
): Promise<IngredientMatch> {
    const key = normalizeQuery(name);
    const cached = readCache(cache, key, now);

    if (cached) return { ...cached, query: name };

    const [best, ...alternatives] = await lookUp(key, searchFoods);
    const match: IngredientMatch = {
        query: name,
        match: best ?? null,
        alternatives: alternatives.slice(0, MAX_ALTERNATIVES),
        confidence: getConfidence(key, best ?? null),
    };

    writeCache(cache, key, match, now);

    return match;
}

/* Matches for each name, looked up in parallel. */
export function matchIngredients(
    names: string[],
    searchFoods: SearchFoods = defaultSearchFoods,
    cache: MatchCache = defaultCache,
): Promise<IngredientMatch[]> {
    return Promise.all(
        names.map((name) => matchIngredient(name, searchFoods, cache)),
    );
}

export type MatchRouteResult =
    | { status: 200; body: MatchIngredientsResponse }
    | {
          status: 400 | 502;
          body: { error: { code: string; message: string } };
      };

/* Handler for POST /api/match-ingredients. */
export async function matchIngredientsRoute(
    body: unknown,
    searchFoods: SearchFoods = defaultSearchFoods,
    cache: MatchCache = defaultCache,
): Promise<MatchRouteResult> {
    const names = (body as Partial<MatchIngredientsRequest> | null)?.names;

    if (
        !Array.isArray(names) ||
        !names.every((name) => typeof name === 'string')
    ) {
        return {
            status: 400,
            body: {
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Expected a body like { "names": ["spinach"] }',
                },
            },
        };
    }

    const cleaned = names
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .slice(0, MAX_NAMES);

    try {
        const matches = await matchIngredients(cleaned, searchFoods, cache);

        return { status: 200, body: { matches } };
    } catch (error) {
        console.error('ingredient matching error:', error);

        return {
            status: 502,
            body: {
                error: {
                    code: 'NUTRITION_LOOKUP_FAILED',
                    message: 'Could not look up nutrition data',
                },
            },
        };
    }
}
