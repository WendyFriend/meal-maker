import {
    MEAL_GENERATORS,
    type GenerateMealRequest,
    type MealGenerator,
} from '../../shared/types/types.js';
import { handleGenerateMealNutritionLab } from './algorithms/generateMealNutritionLab.js';
import { handleGenerateMealOllama } from './algorithms/generateMealOllama.js';

// Absent header means the original Ollama generator; an unknown value is rejected.
export function parseMealGenerator(
    header: string | string[] | undefined,
): MealGenerator | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    if (value === undefined) return 'ollama';
    return MEAL_GENERATORS.find((generator) => generator === value);
}

export function handleGenerateMealRequest(
    input: GenerateMealRequest,
    generatorHeader: string | string[] | undefined,
) {
    const generator = parseMealGenerator(generatorHeader);
    if (!generator) {
        return Promise.resolve({
            status: 400,
            body: { message: 'Unknown meal generator.' },
        });
    }
    return generator === 'nutrition-lab'
        ? handleGenerateMealNutritionLab(input)
        : handleGenerateMealOllama(input);
}
