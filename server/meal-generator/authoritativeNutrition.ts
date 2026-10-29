import type {
    IngredientInfo,
    IngredientMatch,
    IngredientNutrition,
    MealIngredient,
} from '../../shared/types/types.ts';
import type { Micronutrients } from '../../shared/nutrition/nutrients.ts';
import { fixedGrams } from './calibrateMeal.ts';

/* An input ingredient, with USDA data filled in where the request had none.
   `nutritionSource` is only set when the per-100 g values are authoritative
   (USDA or user-supplied); otherwise the model has to estimate them. */
export type EnrichedIngredient = IngredientInfo & {
    nutritionSource?: 'usda' | 'user';
};

/* Looks up a USDA match, or resolves to null if there isn't a usable one. */
export type MatchLookup = (name: string) => Promise<IngredientMatch | null>;

type CompleteMacros = {
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
};

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function hasCompleteMacros(
    ingredient: IngredientInfo,
): ingredient is IngredientInfo & CompleteMacros {
    return (
        isNumber(ingredient.caloriesPer100g) &&
        isNumber(ingredient.proteinPer100g) &&
        isNumber(ingredient.carbohydratePer100g) &&
        isNumber(ingredient.fatPer100g)
    );
}

function hasMicronutrients(micronutrients?: Micronutrients): boolean {
    return !!micronutrients && Object.keys(micronutrients).length > 0;
}

/* Only a confident match is trusted over the user's or the model's
   numbers; a doubtful one could be a different food altogether. */
function usableMatch(match: IngredientMatch | null) {
    return match?.confidence === 'high' ? match.match : null;
}

/*
 * Fill in what the request lacks from USDA: ingredients without complete
 * macros take the matched food's nutrition; ingredients with the user's own
 * macros keep them and only borrow missing micronutrients and fibre,
 * sugar and saturated fat. No usable match leaves the ingredient as given.
 */
export async function enrichIngredients(
    ingredients: IngredientInfo[],
    lookup: MatchLookup,
): Promise<EnrichedIngredient[]> {
    // The client already resolved these to a USDA food (its own match or a
    // USDA search result), so there's nothing to look up.
    const isResolvedUsda = (ingredient: IngredientInfo) =>
        hasCompleteMacros(ingredient) &&
        ingredient.usda !== undefined &&
        hasMicronutrients(ingredient.micronutrientsPer100g);

    const matches = await Promise.all(
        ingredients.map((ingredient) =>
            isResolvedUsda(ingredient) ? null : lookup(ingredient.name),
        ),
    );

    return ingredients.map((ingredient, index) => {
        const food = usableMatch(matches[index]);

        if (isResolvedUsda(ingredient)) {
            return { ...ingredient, nutritionSource: 'usda' };
        }

        if (hasCompleteMacros(ingredient)) {
            if (!food) return { ...ingredient, nutritionSource: 'user' };

            const borrowMicronutrients = !hasMicronutrients(
                ingredient.micronutrientsPer100g,
            );

            return {
                ...ingredient,
                sugarPer100g: ingredient.sugarPer100g ?? food.sugarPer100g,
                saturatedFatPer100g:
                    ingredient.saturatedFatPer100g ?? food.saturatedFatPer100g,
                fiberPer100g: ingredient.fiberPer100g ?? food.fiberPer100g,
                ...(borrowMicronutrients && {
                    micronutrientsPer100g: food.micronutrientsPer100g,
                    usda: ingredient.usda ?? food.usda,
                }),
                nutritionSource: 'user',
            };
        }

        if (!food) return ingredient;

        return {
            name: ingredient.name,
            caloriesPer100g: food.caloriesPer100g,
            proteinPer100g: food.proteinPer100g,
            carbohydratePer100g: food.carbohydratePer100g,
            fatPer100g: food.fatPer100g,
            sugarPer100g: food.sugarPer100g,
            saturatedFatPer100g: food.saturatedFatPer100g,
            fiberPer100g: food.fiberPer100g,
            micronutrientsPer100g: food.micronutrientsPer100g,
            usda: food.usda,
            nutritionSource: 'usda',
            ...(ingredient.fixedAmount && {
                fixedAmount: ingredient.fixedAmount,
            }),
        };
    });
}

// Words that describe a cut or state rather than the food, so
// "Chicken breast, diced" still matches "chicken breast".
const NAME_NOISE = new Set([
    'diced',
    'chopped',
    'sliced',
    'minced',
    'cubed',
    'shredded',
    'grated',
    'crushed',
    'peeled',
    'cooked',
    'uncooked',
    'raw',
    'fresh',
    'dried',
    'dry',
    'large',
    'medium',
    'small',
    'finely',
    'roughly',
    'thinly',
    'boneless',
    'skinless',
    'of',
    'and',
    'the',
    'a',
    'to',
    'taste',
]);

function singular(word: string): string {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }

    return word;
}

/* Core words of an ingredient name: lower-case, no parentheses, cuts or
   states, singular. */
export function nameTokens(name: string): string[] {
    const tokens = name
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .split(/[^a-z0-9]+/)
        .filter((word) => word && !NAME_NOISE.has(word))
        .map(singular);

    // A name that was all noise ("Dried") still needs something to match.
    return tokens.length > 0
        ? tokens
        : name
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter(Boolean);
}

/* 0 when unrelated; otherwise how much of the longer name the shorter
   one covers. Only a name wholly inside the other counts. */
function nameSimilarity(a: string, b: string): number {
    const first = new Set(nameTokens(a));
    const second = new Set(nameTokens(b));
    const [small, large] =
        first.size <= second.size ? [first, second] : [second, first];

    if (small.size === 0 || ![...small].every((word) => large.has(word))) {
        return 0;
    }

    return small.size / large.size;
}

/* Pair each of the model's ingredients with the input it came from, best
   matches first, using each input at most once. Returns input indexes
   (or undefined) in model order. */
export function pairWithInputs(
    modelNames: string[],
    inputNames: string[],
): (number | undefined)[] {
    const candidates: { model: number; input: number; score: number }[] = [];

    modelNames.forEach((modelName, model) => {
        inputNames.forEach((inputName, input) => {
            const score = nameSimilarity(modelName, inputName);
            if (score > 0) candidates.push({ model, input, score });
        });
    });

    candidates.sort((a, b) => b.score - a.score);

    const pairs: (number | undefined)[] = modelNames.map(() => undefined);
    const usedInputs = new Set<number>();

    for (const { model, input } of candidates) {
        if (pairs[model] !== undefined || usedInputs.has(input)) continue;
        pairs[model] = input;
        usedInputs.add(input);
    }

    return pairs;
}

function toAuthoritative(
    modelIngredient: MealIngredient,
    source: EnrichedIngredient,
): MealIngredient {
    // A fixed amount is the cook's, not the model's: it overrides the
    // model's weight and is kept through calibration.
    const fixedWeight = source.fixedAmount
        ? fixedGrams(source.fixedAmount, source.caloriesPer100g)
        : null;

    return {
        name: modelIngredient.name,
        weight: fixedWeight ?? modelIngredient.weight,
        ...(fixedWeight !== null && { fixed: true }),
        caloriesPer100g: source.caloriesPer100g ?? 0,
        proteinPer100g: source.proteinPer100g ?? 0,
        carbohydratePer100g: source.carbohydratePer100g ?? 0,
        fatPer100g: source.fatPer100g ?? 0,
        ...(source.sugarPer100g !== undefined && {
            sugarPer100g: source.sugarPer100g,
        }),
        ...(source.saturatedFatPer100g !== undefined && {
            saturatedFatPer100g: source.saturatedFatPer100g,
        }),
        ...(source.fiberPer100g !== undefined && {
            fiberPer100g: source.fiberPer100g,
        }),
        ...(hasMicronutrients(source.micronutrientsPer100g) && {
            micronutrientsPer100g: source.micronutrientsPer100g,
        }),
        ...(source.usda && { usda: source.usda }),
        nutritionSource: source.nutritionSource,
    };
}

/* Only the fields we ask the model for; whatever else it invented
   (totals, micronutrients) is dropped. */
function toEstimated(modelIngredient: MealIngredient): MealIngredient {
    return {
        name: modelIngredient.name,
        weight: modelIngredient.weight,
        caloriesPer100g: modelIngredient.caloriesPer100g,
        proteinPer100g: modelIngredient.proteinPer100g,
        carbohydratePer100g: modelIngredient.carbohydratePer100g,
        fatPer100g: modelIngredient.fatPer100g,
        ...(isNumber(modelIngredient.fiberPer100g) && {
            fiberPer100g: modelIngredient.fiberPer100g,
        }),
        nutritionSource: 'estimated',
    };
}

function usdaToAuthoritative(
    modelIngredient: MealIngredient,
    food: IngredientNutrition,
): MealIngredient {
    return toAuthoritative(modelIngredient, {
        ...food,
        nutritionSource: 'usda',
    });
}

/*
 * Replace the model's per-100 g numbers with authoritative ones. Each
 * returned ingredient is paired with the input it came from (names are
 * compared loosely); extras the model added, such as oil or garlic, are
 * looked up in USDA; anything still unresolved keeps the model's estimate,
 * marked as 'estimated'.
 */
export async function reattachNutrition(
    modelIngredients: MealIngredient[],
    inputs: EnrichedIngredient[],
    lookup: MatchLookup,
): Promise<MealIngredient[]> {
    const pairs = pairWithInputs(
        modelIngredients.map((ingredient) => ingredient.name),
        inputs.map((input) => input.name),
    );

    return Promise.all(
        modelIngredients.map(async (modelIngredient, index) => {
            const inputIndex = pairs[index];
            const input =
                inputIndex === undefined ? undefined : inputs[inputIndex];

            if (input?.nutritionSource) {
                return toAuthoritative(modelIngredient, input);
            }

            // Not paired with an authoritative input: an unmatched input
            // gets another try (it may have failed before), an added
            // staple is looked up for the first time.
            const food = usableMatch(await lookup(modelIngredient.name));

            return food
                ? usdaToAuthoritative(modelIngredient, food)
                : toEstimated(modelIngredient);
        }),
    );
}

/* Names of ingredients whose nutrition the model had to estimate. */
export function getEstimatedIngredients(
    ingredients: Pick<MealIngredient, 'name' | 'nutritionSource'>[],
): string[] {
    return ingredients
        .filter((ingredient) => ingredient.nutritionSource === 'estimated')
        .map((ingredient) => ingredient.name);
}

/* The meal's ingredient names plus any input names it doesn't already
   cover, for looking up preparation guidance (an input the model dropped
   or renamed can still carry a warning). */
export function namesForGuidance(
    mealNames: string[],
    inputNames: string[],
): string[] {
    const covered = (name: string) =>
        mealNames.some((mealName) => nameSimilarity(mealName, name) > 0);

    return [...mealNames, ...inputNames.filter((name) => !covered(name))];
}
