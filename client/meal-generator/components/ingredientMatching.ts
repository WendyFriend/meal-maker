import type {
    GenerateMealResponse,
    IngredientInfo,
    IngredientMatch,
    MealIngredient,
    NutritionSearchResult,
} from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';

/* Which USDA candidate is used for an ingredient: an index into
   `getCandidates`, or AI_ESTIMATE to let the model estimate. */
export const AI_ESTIMATE = -1;

export type SourceOption = {
    description: string;
    caloriesPer100g: number;
};

/* Where an ingredient's nutrition comes from, as shown in step 1. */
export type IngredientSource = {
    kind: 'matching' | 'yours' | 'edited' | 'usda' | 'estimate';
    caloriesPer100g?: number;
    // The USDA food in use (usda), or the one an edit started from (edited).
    description?: string;
    confidence?: 'high' | 'low';
    // USDA candidates the user can switch between (usda and estimate).
    options?: SourceOption[];
    // Index into `options`; AI_ESTIMATE when the AI estimates instead.
    selected?: number;
};

/* The best match first, then the alternatives. */
export function getCandidates(match: IngredientMatch): NutritionSearchResult[] {
    return match.match ? [match.match, ...match.alternatives] : match.alternatives;
}

/* Without a choice the best match is used, or nothing if there isn't one. */
export function getSelectedIndex(
    match: IngredientMatch,
    choice: number | undefined,
): number {
    if (choice !== undefined) {
        return choice < getCandidates(match).length ? choice : AI_ESTIMATE;
    }

    return match.match ? 0 : AI_ESTIMATE;
}

/* The USDA food's nutrition under the name the user typed. */
export function toIngredientInfo(
    name: string,
    result: NutritionSearchResult,
): IngredientInfo {
    return {
        name,
        caloriesPer100g: result.caloriesPer100g,
        proteinPer100g: result.proteinPer100g,
        carbohydratePer100g: result.carbohydratePer100g,
        fatPer100g: result.fatPer100g,
        sugarPer100g: result.sugarPer100g,
        saturatedFatPer100g: result.saturatedFatPer100g,
        fiberPer100g: result.fiberPer100g,
        micronutrientsPer100g: result.micronutrientsPer100g,
        usda: result.usda ?? undefined,
    };
}

/* Nutrition the user chose for an ingredient from its USDA match. */
export function getMatchedIngredient(
    name: string,
    match: IngredientMatch | null | undefined,
    choice: number | undefined,
): IngredientInfo | undefined {
    if (!match) return undefined;

    const candidate = getCandidates(match)[getSelectedIndex(match, choice)];

    return candidate ? toIngredientInfo(name, candidate) : undefined;
}

export function describeCandidate(result: NutritionSearchResult): SourceOption {
    return {
        description: result.usda?.description ?? result.description,
        caloriesPer100g: result.caloriesPer100g,
    };
}

export function toSourceOptions(match: IngredientMatch): SourceOption[] {
    return getCandidates(match).map(describeCandidate);
}

function getNutritionSource(
    sent: IngredientInfo | undefined,
    isEstimated: boolean,
    usda: IngredientInfo['usda'],
): MealIngredient['nutritionSource'] {
    if (isEstimated) return 'estimated';
    // Not something the user picked, so nothing here says where it's from.
    if (!sent) return usda ? 'usda' : undefined;
    if (sent.caloriesPer100g === undefined) return 'estimated';

    return usda && !('ingredientId' in sent) ? 'usda' : 'user';
}

/*
 * The server should return micronutrients, USDA references and a source on
 * each meal ingredient. Fill in whatever is missing from the nutrition the
 * request carried, so the result still shows it if the model dropped it.
 */
export function enrichGeneratedMeal(
    meal: GenerateMealResponse,
    sent: IngredientInfo[],
): GenerateMealResponse {
    const sentByName = new Map(
        sent.map((info) => [normalizeIngredientName(info.name), info]),
    );
    const estimated = new Set(
        (meal.estimatedIngredients ?? []).map(normalizeIngredientName),
    );

    return {
        ...meal,
        ingredients: meal.ingredients.map((ingredient) => {
            const key = normalizeIngredientName(ingredient.name);
            const info = sentByName.get(key);
            const usda = ingredient.usda ?? info?.usda;

            return {
                ...ingredient,
                micronutrientsPer100g:
                    ingredient.micronutrientsPer100g ??
                    info?.micronutrientsPer100g,
                usda,
                nutritionSource:
                    ingredient.nutritionSource ??
                    getNutritionSource(info, estimated.has(key), usda),
            };
        }),
    };
}
