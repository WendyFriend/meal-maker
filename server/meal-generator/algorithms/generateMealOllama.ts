import type {
    GenerateMealRequest,
    GenerateMealResponse,
} from '../../../shared/types/types.ts';
import { OllamaAiClient } from '../../ai/OllamaAiClient.js';
import { isGenerateMealResponse } from './validateMealResponse.js';
import { getNutritionForIngredients } from '../../nutrition/getNutritionForIngredients.js';
import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';
import { getIngredientPreparation } from '../../../shared/ingredientPreparation.js';

const MEAL_GENERATION_SYSTEM_PROMPT = `
You are MealMaker, a meal-planning assistant.

Create one realistic, balanced meal from the provided ingredients.

Priorities, in order:
1. Use all and only the provided ingredients.
2. Get as close as reasonably possible to the target calories.
3. Keep ingredient portions realistic and practical.
4. Aim for approximately 55% carbs, 15% protein, and 30% fat by energy.

Rules:
- Exact calories and macro percentages are not required.
- Use sensible portion sizes.
- Keep ingredient names exactly as supplied.
- Round ingredient weights to the nearest 5 or 10 g.
- Use provided nutrition data exactly; never change it.
- For missing nutrition, look it up if possible; otherwise estimate it.
- Return nutrition per 100 g for every ingredient.
- Preserve sugarPer100g, saturatedFatPer100g, and fiberPer100g when supplied.
- These three fields are optional. Omit unavailable values rather than inventing them or returning zero.
- Return only valid JSON. Do not use Markdown code fences.

Instructions:
- Write a complete, chronological recipe in the instructions array. Begin each preparation step with "Prepare:" and each cooking or assembly step with "Cook:". Do not include step numbers or Markdown.
- Put all preparation steps first: washing, peeling, cutting (give approximate sizes), draining, pressing, thawing, soaking or blanching as appropriate for the actual ingredient form.
- Follow the provided preparation guidance. Choose one appropriate cooking method rather than listing stove-top and pressure-cooker alternatives in the recipe. If guidance is conditional, only apply it to that form of the ingredient.
- For soaking, say how many hours, whether to drain/rinse and whether to use fresh cooking water. Include overnight preparation before cooking begins. Do not require soaking canned/cooked pulses, lentils, tofu, seeds or nuts unnecessarily.
- If blanching is chosen, specify the vegetable, boiling-water duration in minutes, desired texture and draining/cooling action. Do not claim every leafy green must be blanched or that a brief blanch eliminates oxalate.
- For every heating step specify the action, heat level or oven temperature, approximate duration/range and a clear completion cue. For example: "Cook: Stir the oats over medium-low heat for 1–2 minutes, until evenly coated and fragrant."
- State stirring frequency (constantly, occasionally, or at a stated interval), when to cover/uncover, and draining, resting or natural pressure-release times where relevant. Separate long cooking stages instead of burying several untimed actions in one step.
- Use realistic timings for the cut size and ingredient state. Timings are approximate; pair them with doneness checks. Never use only colour or time to establish meat safety: poultry (including ground poultry) must reach 74°C/165°F; ground beef/pork/lamb 71°C/160°F; whole cuts of beef/pork/lamb 63°C/145°F with a 3-minute rest; and fish 63°C/145°F, measured with a thermometer.
- Water may be used for soaking, boiling and steaming. Do not add oil, salt, sauces or other ingredients unless supplied.
- Keep the portion weights and nutrition basis consistent: identify dry weights before soaking/cooking, and do not treat an explicitly cooked ingredient as dried.
- End with a clear assembly/serving step. Assembly steps do not need an invented cooking duration.

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
  "instructions": ["Prepare: ingredient preparation with required soaking/blanching times", "Cook: action, heat, time and doneness cue"]
}

Do not return meal-level nutrition totals.
`;

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

    const { ingredientsWithNutrition } = await getNutritionForIngredients(
        input.ingredients,
        'usda',
    );
    const nutritionByName = new Map(
        ingredientsWithNutrition.map((ingredient) => [
            ingredient.name.trim().toLowerCase(),
            ingredient,
        ]),
    );
    const ingredients = input.ingredients.map(
        (ingredient) =>
            nutritionByName.get(ingredient.name.trim().toLowerCase()) ??
            ingredient,
    );

    const userPrompt = JSON.stringify({
        targetCalories: input.requirements.calories,
        ingredients,
        preparationGuidance: ingredients.map(({ name, preparationTips }) => ({
            ingredient: name,
            ...getIngredientPreparation(name, preparationTips),
        })),
    });

    const response = await ai.generate(
        MEAL_GENERATION_SYSTEM_PROMPT,
        userPrompt,
        'json',
    );

    let parsed: unknown;

    try {
        parsed = JSON.parse(response);
    } catch (error) {
        console.error('Invalid JSON returned by Ollama:', response);

        throw Object.assign(new Error('AI returned an invalid meal response'), {
            cause: error,
        });
    }

    if (!isGenerateMealResponse(parsed)) {
        console.error('AI meal response failed validation:', response);

        throw new Error('AI returned an invalid meal response');
    }

    const suppliedIngredients = new Map(
        ingredients.map((ingredient) => [
            ingredient.name.trim().toLowerCase(),
            ingredient,
        ]),
    );

    return {
        ...parsed,
        ingredients: parsed.ingredients.map((ingredient) => {
            const supplied = suppliedIngredients.get(
                ingredient.name.trim().toLowerCase(),
            );
            return {
                ...ingredient,
                // Micronutrients come from supplied/catalogue data, never AI estimates.
                ...Object.fromEntries(
                    MICRONUTRIENTS.map(({ key }) => [key, supplied?.[key]]),
                ),
                nutritionSource: supplied?.nutritionSource,
                preparationTips: supplied?.preparationTips,
                caloriesPer100g:
                    supplied?.caloriesPer100g ?? ingredient.caloriesPer100g,
                proteinPer100g:
                    supplied?.proteinPer100g ?? ingredient.proteinPer100g,
                carbohydratePer100g:
                    supplied?.carbohydratePer100g ??
                    ingredient.carbohydratePer100g,
                fatPer100g: supplied?.fatPer100g ?? ingredient.fatPer100g,
                sugarPer100g: supplied?.sugarPer100g ?? ingredient.sugarPer100g,
                saturatedFatPer100g:
                    supplied?.saturatedFatPer100g ??
                    ingredient.saturatedFatPer100g,
                fiberPer100g: supplied?.fiberPer100g ?? ingredient.fiberPer100g,
            };
        }),
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
