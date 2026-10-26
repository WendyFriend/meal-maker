import type {
    GenerateMealRequest,
    GenerateMealResponse,
} from '../../../shared/types/types.ts';
import { OllamaAiClient } from '../../ai/OllamaAiClient.js';
import { isGenerateMealResponse } from './validateMealResponse.js';
import { getNutritionForIngredients } from '../../nutrition/getNutritionForIngredients.js';

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

        throw new Error('AI returned an invalid meal response', {
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
