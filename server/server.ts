import { createServer, ServerResponse } from 'node:http';
import { checkProteinFeasibility } from './meal-generator/checkProteinFeasibility.ts';
import { generateMeal } from './meal-generator/algorithms/generateMeal.ts';
import { getNutritionForIngredients } from './nutrition/getNutritionForIngredients.ts';
import { type GenerateMealRequest } from '../shared/types/types.ts';

// const apiKey = process.env.OLLAMA_API_KEY;
// const model = process.env.OLLAMA_MODEL;

// if (!apiKey) {
//     throw new Error('OLLAMA_API_KEY is not configured');
// }

// if (!model) {
//     throw new Error('OLLAMA_MODEL is not configured');
// }

// const ollamaAiClient = new OllamaAiClient(apiKey, model);

const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/generate-meal') {
        try {
            const body = await readRequestBody(req);
            const input = JSON.parse(body) as GenerateMealRequest;
            const { ingredientsWithNutrition, unresolvedIngredients } =
                await getNutritionForIngredients(input.ingredients);

            const feasibility = checkProteinFeasibility(
                ingredientsWithNutrition,
                input.requirements.proteinPercentage,
            );

            if (!feasibility.feasible) {
                handleInfeasibleRequest(
                    res,
                    input.requirements.proteinPercentage!,
                    feasibility.maximumProteinPercentage,
                );
                return;
            }

            console.log('input:', input);
            const mealIngredients = generateMeal(
                ingredientsWithNutrition,
                input.requirements,
            );
            const result = {
                mealIngredients,
                unresolvedIngredients,
            };

            sendJson(res, 200, result);

            console.log('result:', result);
        } catch (error) {
            console.error('server.ts error: ' + error);

            sendJson(res, 500, {
                message: 'Failed to generate meal',
            });
        }
        return;
    }

    sendJson(res, 404, {
        error: 'Not found',
    });
});

server.listen(3001, () => {
    console.log('Server listening on http://localhost:3001');
});

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
    });

    res.end(JSON.stringify(body));
}

function readRequestBody(req: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function handleInfeasibleRequest(
    res: ServerResponse,
    proteinGoal: number,
    maximumProteinPercentage: number,
) {
    sendJson(res, 422, {
        error: {
            code: 'REQUIREMENT_NOT_MET',
            message: `Protein goal can't be reached`,
            proteinGoal,
            maximumProteinPercentage,
        },
    });
}
