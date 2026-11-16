import type { GenerateMealRequest } from '../../shared/types/types.js';
import { handleGenerateMealNutritionLab } from './algorithms/generateMealNutritionLab.js';

export async function handleGenerateMealRequest(input: GenerateMealRequest) {
    const started = performance.now();
    const result = await handleGenerateMealNutritionLab(input);
    const totalTiming = `generation;dur=${(performance.now() - started).toFixed(1)};desc="App generation handler"`;
    return {
        ...result,
        serverTiming:
            'serverTiming' in result
                ? `${result.serverTiming}, ${totalTiming}`
                : totalTiming,
    };
}
