import type {
    GenerateMealRequest,
    GenerateMealResponse,
    IngredientInfo,
    MealIngredient,
} from '../../../shared/types/types.ts';
import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';
import { generateMealRemote } from '../../nutrition/mealmaker/client.js';
import { matchesFoodDescription } from '../../nutrition/usda/selectFood.js';
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
    const { name, nutritionSource: source } = ingredient;
    const calories = known(ingredient.caloriesPer100g);
    const protein = known(ingredient.proteinPer100g);
    const carbs = known(ingredient.carbohydratePer100g);
    const fat = known(ingredient.fatPer100g);
    // The API accepts a /parse-style match to skip food resolution. Reuse only
    // complete nutrition whose source still describes this ingredient/form.
    if (
        !source ||
        !Number.isSafeInteger(source.fdcId) ||
        source.fdcId <= 0 ||
        !matchesFoodDescription(name, source.description) ||
        calories === undefined ||
        protein === undefined ||
        carbs === undefined ||
        fat === undefined
    )
        return { name };

    return {
        name,
        match: {
            fdcId: source.fdcId,
            description: source.description,
            name,
            caloriesPer100g: calories,
            proteinPer100g: protein,
            carbohydratePer100g: carbs,
            fatPer100g: fat,
            sugarPer100g: known(ingredient.sugarPer100g),
            saturatedFatPer100g: known(ingredient.saturatedFatPer100g),
            fiberPer100g: known(ingredient.fiberPer100g),
            nutritionSource: 'usda',
        },
    };
}

function mapIngredient(
    remote: MealMakerGeneratedIngredient,
    supplied: IngredientInfo | undefined,
): MealIngredient {
    const micronutrients = Object.fromEntries(
        MICRONUTRIENTS.map(({ key }) => [
            key,
            supplied?.[key] ??
                known(
                    remote.micronutrientsPer100g?.[key.replace('Per100g', '')],
                ),
        ]),
    );
    // Without a micronutrient block the lab matched nothing, so a lookup may still help.
    const unavailableMicronutrients = remote.micronutrientsPer100g
        ? MICRONUTRIENTS.filter(
              ({ key }) => micronutrients[key] === undefined,
          ).map(({ key }) => key)
        : undefined;
    return {
        ...micronutrients,
        unavailableMicronutrients,
        name: remote.name,
        weight: remote.weight,
        nutritionSource:
            supplied?.nutritionSource ??
            (remote.usda
                ? {
                      fdcId: remote.usda.fdcId,
                      description: remote.usda.description,
                  }
                : undefined),
        preparationTips: supplied?.preparationTips,
        // Values the user supplied or edited win over the lab's own numbers.
        caloriesPer100g: supplied?.caloriesPer100g ?? remote.caloriesPer100g,
        proteinPer100g: supplied?.proteinPer100g ?? remote.proteinPer100g,
        carbohydratePer100g:
            supplied?.carbohydratePer100g ?? remote.carbohydratePer100g,
        fatPer100g: supplied?.fatPer100g ?? remote.fatPer100g,
        sugarPer100g: supplied?.sugarPer100g ?? known(remote.sugarPer100g),
        saturatedFatPer100g:
            supplied?.saturatedFatPer100g ?? known(remote.saturatedFatPer100g),
        fiberPer100g: supplied?.fiberPer100g ?? known(remote.fiberPer100g),
    };
}

export async function generateMealWithNutritionLab(
    input: GenerateMealRequest,
): Promise<GenerateMealResponse> {
    const remote = (await generateMealRemote({
        ingredients: input.ingredients.map(generationIngredient),
        requirements:
            input.requirements.calories === undefined
                ? {}
                : { calories: input.requirements.calories },
    })) as MealMakerGenerateResponse;

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

export async function handleGenerateMealNutritionLab(
    input: GenerateMealRequest,
) {
    return { status: 200, body: await generateMealWithNutritionLab(input) };
}
