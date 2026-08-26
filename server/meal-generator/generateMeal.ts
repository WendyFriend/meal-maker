import type { AiClient } from '../../src/features/meal-generator/AiClient.js';
import { buildMealPrompt } from './buildMealPrompt.js';
import type {
    GeneratedMeal,
    GenerateMealInput,
} from '../../src/features/meal-generator/types.js';
import { isGeneratedMeal } from './validateGeneratedMeal.js';

export async function generateMeal(
    input: GenerateMealInput,
    aiClient: AiClient,
): Promise<GeneratedMeal> {
    const prompt = buildMealPrompt(input);
    const response = await aiClient.generate(prompt);
    console.log("generateMeal.ts: " + response);

    const parsed: unknown = JSON.parse(response);

    if (!isGeneratedMeal(parsed)) {
        throw new Error('AI returned an invalid meal response');
    }

    return parsed;
}
