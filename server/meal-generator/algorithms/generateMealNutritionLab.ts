import type {
    GenerateMealRequest,
    GenerateMealResponse,
    IngredientInfo,
    MealIngredient,
} from '../../../shared/types/types.ts';
import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';
import {
    generateMealRemote,
    parseIngredientText,
} from '../../nutrition/mealmaker/client.js';
import {
    getNutritionForIngredients,
    hasCompleteNutrition,
} from '../../nutrition/getNutritionForIngredients.js';
import type {
    MealMakerGenerateRequest,
    MealMakerGeneratedIngredient,
    MealMakerGenerateResponse,
} from '../../nutrition/mealmaker/types.js';
import { isGenerateMealResponse } from './validateMealResponse.js';

function known(value: number | null | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}

function normalize(name: string): string {
    return name.trim().toLowerCase();
}

function generationIngredient(
    ingredient: IngredientInfo,
): MealMakerGenerateRequest['ingredients'][number] {
    const micronutrients = Object.fromEntries(
        MICRONUTRIENTS.flatMap(({ key }) => {
            const value = known(ingredient[key]);
            return value === undefined
                ? []
                : [[key.replace('Per100g', ''), value]];
        }),
    );
    // NL merges real user values with reference data. Omit unknown values,
    // preserving genuine zeros and avoiding empty override objects.
    return {
        name: ingredient.name,
        caloriesPer100g: known(ingredient.caloriesPer100g),
        proteinPer100g: known(ingredient.proteinPer100g),
        carbohydratePer100g: known(ingredient.carbohydratePer100g),
        fatPer100g: known(ingredient.fatPer100g),
        sugarPer100g: known(ingredient.sugarPer100g),
        saturatedFatPer100g: known(ingredient.saturatedFatPer100g),
        fiberPer100g: known(ingredient.fiberPer100g),
        ...(Object.keys(micronutrients).length
            ? { micronutrientsPer100g: micronutrients }
            : {}),
    };
}

function mapIngredient(
    remote: MealMakerGeneratedIngredient,
    supplied: IngredientInfo | undefined,
): MealIngredient {
    const micronutrients = Object.fromEntries(
        MICRONUTRIENTS.map(({ key }) => [
            key,
            known(supplied?.[key]) ??
                known(
                    remote.micronutrientsPer100g?.[key.replace('Per100g', '')],
                ),
        ]),
    );
    // Explicit nulls stay unavailable; a missing block from a legacy response
    // can still use the client's cached nutrition fallback.
    const unavailableMicronutrients = remote.micronutrientsPer100g
        ? MICRONUTRIENTS.filter(
              ({ key }) => micronutrients[key] === undefined,
          ).map(({ key }) => key)
        : undefined;
    return {
        ...micronutrients,
        unavailableMicronutrients,
        name: remote.name,
        // The lookup's name for the food, else the name the generator used.
        resolvedName: supplied?.resolvedName ?? remote.name,
        weight: remote.weight,
        thumbnailSource: 'nutrition-lab',
        // Keep the food identity already shown to the user. Generation may
        // rematch the same name to a different reference record, which would
        // otherwise change its thumbnail between selection and results.
        nutritionSource:
            supplied?.nutritionSource ??
            (remote.usda
                ? {
                      fdcId: remote.usda.fdcId,
                      description: remote.usda.description,
                  }
                : undefined),
        preparationTips: supplied?.preparationTips,
        // Use the macro values NL returned: its portions were sized using these.
        caloriesPer100g: remote.caloriesPer100g,
        proteinPer100g: remote.proteinPer100g,
        carbohydratePer100g: remote.carbohydratePer100g,
        fatPer100g: remote.fatPer100g,
        sugarPer100g: known(remote.sugarPer100g),
        saturatedFatPer100g: known(remote.saturatedFatPer100g),
        fiberPer100g: known(remote.fiberPer100g),
    };
}

export async function generateMealWithNutritionLab(
    input: GenerateMealRequest,
    onRemoteTiming?: (durationMs: number) => void,
): Promise<GenerateMealResponse> {
    const started = performance.now();
    const remote = (await generateMealRemote({
        ingredients: input.ingredients.map(generationIngredient),
        requirements: {
            ...(input.requirements.calories === undefined
                ? {}
                : { calories: input.requirements.calories }),
            ...(input.requirements.proteinGrams === undefined
                ? {}
                : { proteinGrams: input.requirements.proteinGrams }),
            ...(input.requirements.preferences?.includes('plant-based')
                ? { dietary: ['vegan' as const] }
                : {}),
            ...(input.requirements.preferences?.includes('high-protein')
                ? { variation: 'higher-protein' as const }
                : {}),
        },
    })) as MealMakerGenerateResponse;
    onRemoteTiming?.(performance.now() - started);

    const supplied = new Map(
        input.ingredients.map((ingredient) => [
            normalize(ingredient.name),
            ingredient,
        ]),
    );
    const meal = {
        mealName: remote.mealName,
        instructions: remote.instructions,
        ingredients: (remote.ingredients ?? []).map((ingredient) =>
            mapIngredient(ingredient, supplied.get(normalize(ingredient.name))),
        ),
    };

    if (!isGenerateMealResponse(meal)) {
        console.error('Nutrition Lab meal response failed validation:', remote);
        throw new Error('Nutrition Lab returned an invalid meal response');
    }
    return meal;
}

// Typed text such as "chicken and rice" becomes one database name per food.
// Ingredients that arrive with complete nutrition (saved, or prefetched by the
// client) are used as sent, so only the rest cost a parse. A failed parse keeps
// what was typed.
async function splitTypedIngredients(
    ingredients: IngredientInfo[],
): Promise<IngredientInfo[]> {
    const groups = await Promise.all(
        ingredients.map(async (ingredient): Promise<IngredientInfo[]> => {
            if (hasCompleteNutrition(ingredient)) return [ingredient];
            try {
                const { ingredients: parsed } = await parseIngredientText(
                    ingredient.name,
                );
                const names = parsed
                    .map((item) => (item.name ?? item.said).trim())
                    .filter(Boolean);
                if (names.length === 0) return [ingredient];
                return names.length === 1
                    ? [{ ...ingredient, name: names[0] }]
                    : names.map((name) => ({ name }));
            } catch (error) {
                console.warn(`Could not parse "${ingredient.name}":`, error);
                return [ingredient];
            }
        }),
    );
    const seen = new Set<string>();
    return groups.flat().filter((ingredient) => {
        const key = normalize(ingredient.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function handleGenerateMealNutritionLab(
    input: GenerateMealRequest,
) {
    let remoteMs = 0;
    const typed = await splitTypedIngredients(input.ingredients);
    // Generation matches names less reliably than food lookup (e.g. "rolled oats"),
    // so resolve what the client did not already look up.
    const { ingredientsWithNutrition } = await getNutritionForIngredients(
        typed.filter((ingredient) => !hasCompleteNutrition(ingredient)),
        'nutrition-lab',
    );
    const resolved = new Map(
        ingredientsWithNutrition.map((ingredient) => [
            normalize(ingredient.name),
            ingredient,
        ]),
    );
    const body = await generateMealWithNutritionLab(
        {
            ...input,
            ingredients: typed.map(
                (ingredient) =>
                    resolved.get(normalize(ingredient.name)) ?? ingredient,
            ),
        },
        (durationMs) => {
            remoteMs = durationMs;
        },
    );
    return {
        status: 200,
        body,
        serverTiming: `nutrition_lab;dur=${remoteMs.toFixed(1)};desc="Nutrition Lab round trip"`,
    };
}
