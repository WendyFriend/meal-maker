import type { AiClient } from '../ai/AiClient.ts';
import { buildMealPrompt } from './buildMealPrompt.ts';
import type {
    GeneratedMeal,
    GenerateMealInput,
} from '../../client/meal-generator/types.ts';
import { isGeneratedMeal } from './validateGeneratedMeal.ts';

export async function generateMealWithAI(
    input: GenerateMealInput,
    aiClient: AiClient,
): Promise<GeneratedMeal> {
    const prompt = buildMealPrompt(input);
    const response = await aiClient.generate(prompt);
    console.log('generateMeal.ts: ' + response);

    const parsed: unknown = JSON.parse(response);

    if (!isGeneratedMeal(parsed)) {
        throw new Error('AI returned an invalid meal response');
    }

    return parsed;
}
