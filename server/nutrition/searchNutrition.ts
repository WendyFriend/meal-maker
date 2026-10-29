import type {
    NutritionSearchResponse,
    NutritionSearchResult,
} from '../../shared/types/types.ts';
import { mapUSDAFoodToIngredientNutrition } from './usda/mapper.ts';
import type { USDAFood, USDASearchResponse } from './usda/types.ts';
import { localSearchFoods } from './localSearchFoods.ts';

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;
// Fetch extra so deduplication still leaves up to MAX_RESULTS.
const USDA_PAGE_SIZE = 50;

export type SearchFoods = (params: {
    query: string;
    dataType?: string[];
    pageSize?: number;
    sortBy?: string;
    requireAllWords?: boolean;
}) => Promise<USDASearchResponse>;

// The app's nutrition search and ingredient matching (matchIngredients.ts,
// which imports this) both default to this. It used to call the live USDA
// FoodData Central API; it now reads nutrition_lab, which mirrors the same
// USDA data plus the naming/search work done there (see
// server/nutrition/localSearchFoods.ts) -- faster, offline, no API key, and
// a better match for bare one-word queries than USDA's own relevance.
export const defaultSearchFoods: SearchFoods = localSearchFoods;

export type NutritionRouteResult =
    | { status: 200; body: NutritionSearchResponse }
    | {
          status: 502;
          body: { error: { code: 'NUTRITION_LOOKUP_FAILED'; message: string } };
      };

/* "Chicken, broilers or fryers, breast, raw" → "Chicken". Keeps a short
   second part ("Rice, white") so common foods stay distinguishable. */
// USDA qualifiers that add length without telling foods apart.
const FILLER_PARTS = new Set([
    'raw',
    'broilers or fryers',
    'meat only',
    'all commercial varieties',
    'nfs',
    'ns as to form',
    'unprepared',
]);

export function cleanFoodName(description: string): string {
    const [first = description.trim(), ...rest] = description
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    // Keep up to two short qualifiers, e.g. "Chicken, breast" rather than
    // "Chicken", so distinct foods don't collapse into one name.
    const qualifiers = rest
        .filter((part) => !FILLER_PARTS.has(part.toLowerCase()))
        .filter((part) => part.split(/\s+/).length <= 2)
        .slice(0, 2);
    const name = [first, ...qualifiers].join(', ');

    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/* Words that mark a food as a product made from the ingredient rather than
   the ingredient itself: "Tomato powder", "Flour, almond", "Bread, egg". */
const PROCESSED_WORDS =
    /\b(powder|powdered|flour|starch|bran|paste|puree|sauce|soup|juice|syrup|extract|concentrate|canned|frozen|dried|dehydrated|chips?|snacks?|crackers?|cookies?|cake|cakes|pie|pies|pastry|pastries|dressing|stuffing|gravy|rolls?|buns?|muffins?|noodles?|pasta|cereal|granola|bar|bars|beverage|drink|dessert|pudding|candy|candies|frosting|topping|filling|mix|shortening|margarine|oil|spread|substitute|imitation|meatless|babyfood|baby food|infant|toddler|junior|restaurant|fast food|frankfurter|bologna|sausage|salami|ham|bacon|lunchmeat|nuggets?|tenders?|patt(y|ies)|sticks?|strips?|breaded|battered|baked goods|condensed|sweetened)\b/;

/* Cut and preparation qualifiers that describe part of the ingredient. */
const PREPARATION_WORDS =
    /\b(raw|cooked|boiled|fried|roasted|baked|canned|frozen|toasted|grilled|broiled|braised|steamed|stewed|simmered|heated|reheated|prepared|drained|sliced|chopped|diced|minced|ground|whole|skim|nonfat|lowfat|low-fat|low fat|reduced|light|unsalted|salted|iodized|enriched|unenriched|bleached|unbleached|refined|unrefined|instant|quick|regular|plain|dry|fresh)\b/;

// Qualifier parts that carry no identity: "Crackers, milk" ≠ milk.
const WEAK_SECOND_PARTS = new Set([
    'plain',
    'dry',
    'fresh',
    'raw',
    'commercial',
    'commercially prepared',
    'frozen',
    'canned',
]);

// "tomatoes" → "tomato", "berries" → "berry", "potatoes" → "potato".
function singularize(word: string): string {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
    if (word.length > 4 && word.endsWith('ses')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }

    return word;
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9%]+/)
        .filter(Boolean)
        .map(singularize);
}

/*
 * USDA's own relevance score is weak for short queries — "bread" ranks every
 * "Bread, <variant>" identically, and "tomato" puts powder and sauce above
 * raw tomatoes. Re-rank on what a cook means when they type a bare word:
 *
 *  1. the query must be the food itself, not a product that merely mentions
 *     it ("Tomato powder", "Bread, egg" for "bread"),
 *  2. the head noun of USDA's description is the ingredient ("Tomatoes, …"),
 *  3. the fewest extra qualifiers win, so "Bread, white, commercial" beats
 *     "Bread, whole-wheat, commercially prepared, toasted",
 *  4. raw/plain foods beat cooked or processed ones unless the query names
 *     that state.
 */
export function scoreFood(description: string, query: string): number {
    const text = description.toLowerCase();
    const parts = text.split(',').map((part) => part.trim());
    const head = parts[0] ?? '';
    const headWords = new Set(tokenize(head));
    const textWords = new Set(tokenize(text));
    const queryWords = tokenize(query);
    const querySet = new Set(queryWords);
    const queryText = queryWords.join(' ');
    let score = 0;

    // 1. Is the query the food, or only a word inside a product name?
    const headIsQuery = queryWords.every((word) => headWords.has(word));
    const queryInHead = queryWords.some((word) => headWords.has(word));

    if (headIsQuery && headWords.size === querySet.size) {
        score += 12; // "Tomatoes, …" for "tomato"
    } else if (headIsQuery) {
        score += 9; // "Bread, white" for "bread"
    } else if (queryInHead) {
        score += 6; // "Sweet potato" for "potato" — wrong food, still close
    } else if (queryWords.every((word) => textWords.has(word))) {
        // The word only appears later in the description: usually a product.
        // "Cheese, cheddar" for "cheddar" is the good case, so reward the
        // query being a whole qualifier part.
        const wholePart = parts.some(
            (part) =>
                part.length > 0 &&
                tokenize(part).join(' ') === queryText,
        );
        score += wholePart ? 7 : 1;
    } else {
        score -= 12;
    }

    // 2. Products and preparation that the user did not ask for.
    const wantsPrepared = PREPARATION_WORDS.test(query) || querySet.has('powder');
    const productHits = (text.match(PROCESSED_WORDS) ?? []).length;

    if (productHits > 0 && !PROCESSED_WORDS.test(query)) {
        score -= Math.min(productHits, 3) * 4;
    }

    // "Bread, egg" — the query is the head and the product word is a
    // flavour/variant qualifier, so it is a different food than plain bread.
    if (!wantsPrepared) {
        if (/\braw\b/.test(text)) score += 2;
        const prepared = (text.match(PREPARATION_WORDS) ?? []).length;
        score -= prepared * 0.5;
    } else if (PREPARATION_WORDS.test(query)) {
        // Reward matching the state the user named.
        const named = (query.match(PREPARATION_WORDS) ?? []).length;
        const shared = (text.match(PREPARATION_WORDS) ?? []).length;
        score += Math.min(named, shared) * 1.5;
    }

    // 3. Fewer qualifiers is closer to the bare ingredient.
    score -= Math.max(parts.length - 1, 0) * 0.8;

    // 4. Prefer short, unambiguous descriptions.
    score -= text.length / 60;

    // "Crackers, milk": the second part restates the query but the head
    // is a different food, so a weak qualifier is a bad sign.
    if (!headIsQuery && parts.length > 1) {
        const second = (parts[1] ?? '').trim();
        if (WEAK_SECOND_PARTS.has(second)) score -= 2;
    }

    return score;
}

/*
 * Search USDA for the query and return distinct, ranked foods. `rank`
 * lets callers apply a different scoring than the default text match.
 */
export async function searchRankedFoods(
    query: string,
    searchFoods: SearchFoods,
    options: {
        requireAllWords?: boolean;
        limit?: number;
        rank?: (food: USDAFood, query: string) => number;
    } = {},
): Promise<NutritionSearchResult[]> {
    const {
        requireAllWords = true,
        limit = MAX_RESULTS,
        rank = (food, q) => scoreFood(food.description, q),
    } = options;
    const data = await searchFoods({
        query,
        dataType: ['SR Legacy', 'Foundation'],
        pageSize: USDA_PAGE_SIZE,
        sortBy: 'relevance',
        requireAllWords,
    });

    const foods = [...(data.foods ?? [])].sort(
        (a, b) => rank(b, query) - rank(a, query),
    );
    const seen = new Set<string>();
    const results: NutritionSearchResult[] = [];

    for (const food of foods) {
        const name = cleanFoodName(food.description);
        const key = name.toLowerCase();

        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        results.push({
            ...mapUSDAFoodToIngredientNutrition(food),
            name,
            source: 'usda',
            description: food.description,
        });

        if (results.length >= limit) {
            break;
        }
    }

    return results;
}

export async function searchNutrition(
    query: string | undefined,
    searchFoods: SearchFoods = defaultSearchFoods,
): Promise<NutritionRouteResult> {
    const q = (query ?? '').trim();

    if (q.length < MIN_QUERY_LENGTH) {
        return { status: 200, body: { results: [] } };
    }

    try {
        const results = await searchRankedFoods(q, searchFoods);

        return { status: 200, body: { results } };
    } catch (error) {
        console.error('nutrition lookup error:', error);

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
