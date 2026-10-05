// import { OllamaAiClient } from './ai/OllamaAiClient.js';
// import { getNutritionForIngredients } from './nutrition/getNutritionForIngredients.js';
// import type {
//     GenerateMealRequest,
//     IngredientNutrition,
// } from '../shared/types/types.ts';

import type { GenerateMealRequest, GenerateMealResponse } from "../../../shared/types/types.ts";
import { OllamaAiClient } from "../../ai/OllamaAiClient.js";

const MEAL_GENERATION_SYSTEM_PROMPT = `
You are MealMaker, a meal-planning assistant.

Create one realistic, balanced meal using all provided ingredients.

Requirements:
- Aim for the provided total calories.
- Prioritise achieving the target calories goal, and aim for 55% of energy from carbs, 15% from protein, 30% from fat.
- Use all of and only the provided ingredients.
- Use sensible portion sizes and round ingredient weights to the nearest 5 or 10 g.
- Use provided nutrition data exactly; do not change it.
- For ingredients with missing nutrition, use a reliable lookup if available; otherwise estimate it.
- Return nutrition per 100 g for every ingredient.
- Mark each nutrition source as provided, ai_lookup, or ai_estimate.
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
      "fatPer100g": 0,
      "nutritionSource": "provided | ai_lookup | ai_estimate"
    }
  ],
  "instructions": ["string"]
}
`;

export async function generateMealWithOllama(
    input: GenerateMealRequest
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

    const userPrompt = JSON.stringify({
        targetCalories: input.requirements.calories,
        ingredients: input.ingredients,
    });

    const response = await ai.generate(
        MEAL_GENERATION_SYSTEM_PROMPT,
        userPrompt,
        'json',
    );

    try {
        return JSON.parse(response) as GenerateMealResponse;
    } catch {
        console.error('Invalid JSON returned by Ollama:', response);
        throw new Error('AI returned an invalid meal response');
    }
}

export async function handleGenerateMealOllama(input: GenerateMealRequest) {
    const meal = await generateMealWithOllama(
        input
    );

    console.log('AI generated meal:', meal);

    return {
        status: 200,
        body: meal,
    };
}
