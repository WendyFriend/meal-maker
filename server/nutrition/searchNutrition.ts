import type {
    NutritionSearchResponse,
    NutritionSearchResult,
} from '../../shared/types/types.ts';
import { mapUSDAFoodToIngredientNutrition } from './usda/mapper.ts';
import type { USDASearchResponse } from './usda/types.ts';

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;
// Fetch extra so deduplication still leaves up to MAX_RESULTS.
const USDA_PAGE_SIZE = 50;

type SearchFoods = (params: {
    query: string;
    dataType?: string[];
    pageSize?: number;
    sortBy?: string;
    requireAllWords?: boolean;
}) => Promise<USDASearchResponse>;

// Imported lazily: the USDA client throws at load time without an API key.
const defaultSearchFoods: SearchFoods = async (params) => {
    const { searchFoods } = await import('./usda/client.ts');
    return searchFoods(params);
};

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

// USDA categories that rarely mean the plain ingredient someone typed.
const PROCESSED_PREFIXES = [
    'babyfood',
    'baby food',
    'infant formula',
    'snacks',
    'fast foods',
    'restaurant',
    'fat,',
    'frankfurter',
    'bologna',
    'bratwurst',
    'sausage',
    'soup',
    'cereals ready-to-eat',
];

/*
 * USDA's own ordering is weak for short queries, so re-rank: prefer foods
 * whose leading name is the query, that mention every query word, are raw
 * or plainly cooked, and have short descriptions.
 */
export function scoreFood(description: string, query: string): number {
    const text = description.toLowerCase();
    const [head = ''] = text.split(',');
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let score = 0;

    if (head.trim() === words.join(' ')) score += 6;
    if (words.some((word) => head.includes(word))) score += 3;
    score += words.filter((word) => text.includes(word)).length * 2;
    if (/\braw\b/.test(text)) score += 1;
    if (PROCESSED_PREFIXES.some((prefix) => text.startsWith(prefix))) {
        score -= 8;
    }
    if (/\b(meatless|imitation)\b/.test(text)) score -= 8;
    score -= text.length / 40;

    return score;
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
        const data = await searchFoods({
            query: q,
            dataType: ['SR Legacy', 'Foundation'],
            pageSize: USDA_PAGE_SIZE,
            sortBy: 'relevance',
            requireAllWords: true,
        });

        const foods = [...(data.foods ?? [])].sort(
            (a, b) => scoreFood(b.description, q) - scoreFood(a.description, q),
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

            if (results.length >= MAX_RESULTS) {
                break;
            }
        }

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
