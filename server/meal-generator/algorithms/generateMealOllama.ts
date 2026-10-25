import type {
    DietaryPreference,
    GenerateMealRequest,
    GenerateMealResponse,
    IngredientInfo,
    MealType,
} from '../../../shared/types/types.ts';
import { OllamaAiClient } from '../../ai/OllamaAiClient.js';
import { isGenerateMealResponse } from './validateMealResponse.js';
import { calibrateMeal, getMealTotals } from '../calibrateMeal.js';

const DEFAULT_PROTEIN_PERCENTAGE = 15;
// Carbs and fat share the remaining energy in the default 55:30 ratio.
const CARB_SHARE_OF_REMAINDER = 55 / 85;

export function getMacroSplit(proteinPercentage?: number) {
    const protein =
        typeof proteinPercentage === 'number' &&
        Number.isFinite(proteinPercentage) &&
        proteinPercentage > 0
            ? Math.min(Math.round(proteinPercentage), 80)
            : DEFAULT_PROTEIN_PERCENTAGE;
    const carbs = Math.round((100 - protein) * CARB_SHARE_OF_REMAINDER);

    return { carbs, protein, fat: 100 - protein - carbs };
}

const MEAL_TYPE_GUIDANCE: Record<MealType, string> = {
    breakfast: 'a breakfast dish',
    lunch: 'a lunch dish',
    dinner: 'a dinner dish',
    snack: 'a small snack',
};

const DIETARY_GUIDANCE: Record<DietaryPreference, string> = {
    vegetarian: 'vegetarian (no meat, poultry, fish or seafood)',
    vegan: 'vegan (no animal products, including dairy, eggs and honey)',
    'dairy-free': 'dairy-free (no milk, cheese, butter, yoghurt or cream)',
    'gluten-free': 'gluten-free (no wheat, barley, rye or regular oats)',
};

export function buildMealPrompts(input: GenerateMealRequest): {
    systemPrompt: string;
    userPrompt: string;
} {
    const { requirements } = input;
    const split = getMacroSplit(requirements.proteinPercentage);
    const servings = requirements.servings ?? 1;
    const dietary = requirements.dietary ?? [];
    const variation = requirements.variation;

    const rules: string[] = [];

    if (requirements.mealType) {
        rules.push(
            `- Make it ${MEAL_TYPE_GUIDANCE[requirements.mealType]} suited to ${requirements.mealType}.`,
        );
    }

    if (dietary.length > 0) {
        rules.push(
            `- Dietary requirements are a HARD rule: the meal must be ${dietary
                .map((d) => DIETARY_GUIDANCE[d])
                .join(
                    ' and ',
                )}. Never include an ingredient that violates this. If a provided ingredient conflicts, leave it out.`,
        );
    }

    if (variation === 'different') {
        rules.push(
            requirements.previousMealName
                ? `- Make a clearly different dish from "${requirements.previousMealName}" (different name, style and method).`
                : '- Make a distinctive, different dish from the usual choice.',
        );
    } else if (variation === 'higher-protein') {
        rules.push(
            `- Make the meal noticeably higher in protein than usual; the ${split.protein}% protein target is a minimum.`,
        );
    } else if (variation === 'lower-calorie') {
        rules.push(
            '- Make the meal about 20% lower in calories than the target calories per serving (or than the previous meal if there is no target).',
        );
    }

    const systemPrompt = `
You are MealMaker, a meal-planning assistant.

Create one realistic, balanced meal from the provided ingredients.

Priorities, in order:
1. Never break a dietary requirement (if any are given).
2. Use all and only the provided ingredients (except any left out for dietary reasons).
3. Hit the target calories per serving: the total must be within 5% of it.
4. Aim for approximately ${split.carbs}% carbs, ${split.protein}% protein, and ${split.fat}% fat by energy.
5. Keep ingredient portions realistic and practical.

Rules:
- Target calories are PER SERVING. Ingredient weights and nutrition are also PER SERVING; do not scale them up for the number of servings.
- Meal calories = sum of (weight × caloriesPer100g / 100). Work this out and adjust the weights until it matches the target before answering.
- Use raw (uncooked) weights, and give nutrition per 100 g for that same raw state (e.g. dry rice, dry oats, raw chicken).
- If no target calories are given, use sensible portions for one person.
- Round ingredient weights to the nearest 5 or 10 g.
- Use provided nutrition data exactly; never change it.
- For missing nutrition, look it up if possible; otherwise estimate it.
- Return nutrition per 100 g for every ingredient.
- Return only valid JSON. Do not use Markdown code fences.
${rules.join('\n')}

Response shape:
{
  "mealName": "string",
  "ingredients": [
    {
      "name": "string",
      "weight": 0,
      "caloriesPer100g": 0,
      "proteinPer100g": 0,
      "carbohydratePer100g": 0,
      "fatPer100g": 0
    }
  ],
  "instructions": ["string"]
}

Do not return meal-level nutrition totals.
`;

    const userPrompt = JSON.stringify({
        targetCaloriesPerServing: requirements.calories,
        servings,
        targetProteinPercentage: split.protein,
        mealType: requirements.mealType,
        dietary: dietary.length > 0 ? dietary : undefined,
        variation,
        previousMealName: requirements.previousMealName,
        ingredients: input.ingredients,
    });

    return { systemPrompt, userPrompt };
}

/*
 * Scale the model's portions onto the requested targets (see
 * calibrateMeal). Without a calorie target there's nothing to hit, except
 * that "higher protein" still lifts the protein share.
 */
export function calibrateToRequirements(
    ingredients: GenerateMealResponse['ingredients'],
    requirements: GenerateMealRequest['requirements'],
) {
    const current = getMealTotals(ingredients);
    let calories = requirements.calories;
    let proteinPercentage = requirements.proteinPercentage;

    if (calories !== undefined && requirements.variation === 'lower-calorie') {
        calories *= 0.8;
    }

    if (requirements.variation === 'higher-protein') {
        proteinPercentage = Math.max(
            proteinPercentage ?? 0,
            Math.min(current.proteinPercentage + 8, 60),
        );
        calories ??= current.calories;
    }

    if (calories === undefined) return ingredients;

    return calibrateMeal(ingredients, { calories, proteinPercentage });
}

/* Names of ingredients the caller gave us without calories or protein, so
   the model had to estimate them. */
export function getEstimatedIngredients(
    ingredients: IngredientInfo[],
): string[] {
    return ingredients
        .filter(
            (ingredient) =>
                typeof ingredient.caloriesPer100g !== 'number' ||
                typeof ingredient.proteinPer100g !== 'number',
        )
        .map((ingredient) => ingredient.name);
}

export async function generateMealWithOllama(
    input: GenerateMealRequest,
): Promise<GenerateMealResponse> {
    const apiKey = process.env.OLLAMA_API_KEY;
    const model = process.env.OLLAMA_MODEL;

    if (!apiKey) {
        throw new Error('OLLAMA_API_KEY is not configured');
    }

    if (!model) {
        throw new Error('OLLAMA_MODEL is not configured');
    }

    const ai = new OllamaAiClient(apiKey, model);

    const { systemPrompt, userPrompt } = buildMealPrompts(input);

    const response = await ai.generate(systemPrompt, userPrompt, 'json');

    let parsed: unknown;

    try {
        parsed = JSON.parse(response);
    } catch (error) {
        console.error('Invalid JSON returned by Ollama:', response);

        throw new Error('AI returned an invalid meal response', {
            cause: error,
        });
    }

    if (!isGenerateMealResponse(parsed)) {
        console.error('AI meal response failed validation:', response);

        throw new Error('AI returned an invalid meal response');
    }

    const estimatedIngredients = getEstimatedIngredients(input.ingredients);
    const ingredients = calibrateToRequirements(
        parsed.ingredients,
        input.requirements,
    );

    // Computed server-side; ignore anything the model put in this field.
    const meal: GenerateMealResponse = { ...parsed };
    delete meal.estimatedIngredients;

    return {
        ...meal,
        ingredients,
        servings: input.requirements.servings ?? 1,
        ...(estimatedIngredients.length > 0 && { estimatedIngredients }),
    };
}

export async function handleGenerateMealOllama(input: GenerateMealRequest) {
    const meal = await generateMealWithOllama(input);

    console.log('AI generated meal:', meal);

    return {
        status: 200,
        body: meal,
    };
}
