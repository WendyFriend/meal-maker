// Route for POST /api/parse-recipe.
//
// Takes what the cook said (or typed) and returns ingredients ready for the meal
// generator, plus any nutrition figures they stated. Nutrition is read from the
// local database, so the response can be used directly without a second lookup.
import type {
    ParsedIngredient,
    ParseRecipeResponse,
    SpokenMealPeriod,
    SpokenTarget,
} from '../../shared/types/spoken.ts';
import {
    isNutritionDbConfigured,
    type NutritionRow,
} from './nutritionDb.ts';
import { parseSpokenRequest, type ParsedItem } from './parseSpokenRequest.ts';

const MAX_TEXT_LENGTH = 500;
const MAX_INGREDIENTS = 12;

export type { ParsedIngredient, ParseRecipeResponse, SpokenMealPeriod, SpokenTarget };

export type ParseRecipeRouteResult =
    | { status: 200; body: ParseRecipeResponse }
    | { status: 400 | 503; body: { error: { code: string; message: string } } };

/**
 * Maps a database row onto the app's per-100 g nutrition shape.
 *
 * The field names differ (`protein_g` vs `proteinPer100g`) and the row is
 * nullable throughout, so this is where "database" becomes "app". Anything null
 * in the database becomes 0, which is what the meal generator expects: it treats
 * absent nutrition as an estimate rather than as a real zero, and a 0 here would
 * claim the food has no protein.
 */
export function toIngredientNutrition(row: NutritionRow): NonNullable<ParsedIngredient['match']> {
    return {
        name: row.description,
        caloriesPer100g: row.kcal ?? 0,
        proteinPer100g: row.protein_g ?? 0,
        carbohydratePer100g: row.carb_g ?? 0,
        fatPer100g: row.fat_g ?? 0,
        sugarPer100g: row.sugar_g ?? undefined,
        saturatedFatPer100g: row.sat_fat_g ?? undefined,
        fiberPer100g: row.fiber_g ?? undefined,
        nutritionSource: 'usda',
        fdcId: row.fdc_id,
        description: row.description,
    };
}

function toParsedIngredient(item: ParsedItem): ParsedIngredient {
    return {
        said: item.said,
        match: item.food ? toIngredientNutrition(item.food) : null,
        alternatives: item.alternatives
            .map(toIngredientNutrition)
            .filter((value): value is NonNullable<typeof value> => value !== null),
        confidence: item.food?.tier ?? null,
        quantity: item.quantity,
        certainty: item.certainty,
    };
}

/**
 * Handles the route.
 *
 * `parse` is injectable so the parser can be swapped in tests without a model or
 * a database.
 */
export async function parseRecipeRoute(
    body: unknown,
    parse: typeof parseSpokenRequest = parseSpokenRequest,
): Promise<ParseRecipeRouteResult> {
    const text = (body as { text?: unknown } | null)?.text;

    if (typeof text !== 'string' || text.trim().length < 2) {
        return {
            status: 400,
            body: {
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Expected a body like { "text": "rice and chicken" }.',
                },
            },
        };
    }

    if (text.length > MAX_TEXT_LENGTH) {
        return {
            status: 400,
            body: {
                error: {
                    code: 'TEXT_TOO_LONG',
                    message: 'Keep it under 500 characters.',
                },
            },
        };
    }

    if (!isNutritionDbConfigured()) {
        return {
            status: 503,
            body: {
                error: {
                    code: 'NUTRITION_DB_MISSING',
                    message:
                        'NUTRITION_DATABASE_URL is not set, so the local nutrition database is unavailable.',
                },
            },
        };
    }

    try {
        const parsed = await parse(text.trim());
        return {
            status: 200,
            body: {
                ingredients: parsed.items.slice(0, MAX_INGREDIENTS).map(toParsedIngredient),
                targets: parsed.targets,
                mealPeriod: parsed.mealPeriod,
                usedModel: parsed.usedModel,
            },
        };
    } catch (error) {
        console.error('parse-recipe failed:', error);
        return {
            status: 503,
            body: {
                error: {
                    code: 'PARSE_FAILED',
                    message: 'Could not search the nutrition database.',
                },
            },
        };
    }
}
