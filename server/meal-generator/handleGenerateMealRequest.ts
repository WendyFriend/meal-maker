import {
    DEFAULT_MEAL_GENERATOR,
    MEAL_GENERATORS,
    type GenerateMealRequest,
    type MealGenerator,
} from '../../shared/types/types.js';
import { handleGenerateMealNutritionLab } from './algorithms/generateMealNutritionLab.js';
import { handleGenerateMealOllama } from './algorithms/generateMealOllama.js';

// An absent header uses the app default; an unknown value is rejected.
export function parseMealGenerator(
    header: string | string[] | undefined,
): MealGenerator | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    if (value === undefined) return DEFAULT_MEAL_GENERATOR;
    return MEAL_GENERATORS.find((generator) => generator === value);
}

export async function handleGenerateMealRequest(
    input: GenerateMealRequest,
    generatorHeader: string | string[] | undefined,
) {
    const started = performance.now();
    const generator = parseMealGenerator(generatorHeader);
    if (!generator) {
        return {
            status: 400,
            body: { message: 'Unknown meal generator.' },
            serverTiming: undefined,
        };
    }
    const result = await (generator === 'nutrition-lab'
        ? handleGenerateMealNutritionLab(input)
        : handleGenerateMealOllama(input));
    const totalTiming = `generation;dur=${(performance.now() - started).toFixed(1)};desc="App generation handler"`;
    return {
        ...result,
        serverTiming:
            'serverTiming' in result
                ? `${result.serverTiming}, ${totalTiming}`
                : totalTiming,
    };
}
