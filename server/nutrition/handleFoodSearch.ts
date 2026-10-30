import type {
    FoodSuggestionsResponse,
    ParseIngredientsResponse,
} from '../../shared/types/types.ts';
import { parseIngredientText, searchFoods } from './mealmaker/client.js';

const MAX_SUGGESTIONS = 8;
const MAX_PARSE_TEXT = 500;

type Result<T> =
    { status: 200; body: T } | { status: 400 | 502; body: { message: string } };

// Suggestions for the ingredient search box, from the Nutrition Lab database.
export async function handleFoodSuggestions(
    query: string | null,
): Promise<Result<FoodSuggestionsResponse>> {
    const q = (query ?? '').trim();
    if (q.length < 2 || q.length > 100) {
        return {
            status: 400,
            body: { message: 'Search with 2 to 100 characters.' },
        };
    }
    try {
        const { results } = await searchFoods(q, MAX_SUGGESTIONS);
        return {
            status: 200,
            body: {
                results: results.map((food) => ({
                    fdcId: food.fdcId,
                    name: food.name ?? food.description,
                    description: food.description,
                    caloriesPer100g: food.per100g.kcal ?? undefined,
                })),
            },
        };
    } catch (error) {
        console.error('Food suggestions failed:', error);
        return {
            status: 502,
            body: { message: 'Food search is unavailable.' },
        };
    }
}

// Splits "chicken, rice and broccoli" into one name per food.
export async function handleParseIngredients(
    input: unknown,
): Promise<Result<ParseIngredientsResponse>> {
    const text =
        typeof input === 'object' && input !== null && 'text' in input
            ? input.text
            : undefined;
    if (
        typeof text !== 'string' ||
        text.trim().length < 2 ||
        text.length > MAX_PARSE_TEXT
    ) {
        return {
            status: 400,
            body: { message: 'Provide 2 to 500 characters of text.' },
        };
    }
    try {
        const { ingredients } = await parseIngredientText(text.trim());
        return {
            status: 200,
            body: {
                ingredients: ingredients
                    .map((ingredient) =>
                        (ingredient.name ?? ingredient.said).trim(),
                    )
                    .filter(Boolean),
            },
        };
    } catch (error) {
        console.error('Ingredient parsing failed:', error);
        return {
            status: 502,
            body: { message: 'Ingredient parsing is unavailable.' },
        };
    }
}
