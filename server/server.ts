import { createServer, ServerResponse } from 'node:http';
import { OllamaAiClient } from './ai/OllamaAiClient.js';
import { generateMeal } from './meal-generator/generateMeal.js';
import type { GenerateMealInput } from '../src/features/meal-generator/types.js';
import process from 'node:process';
import { checkProteinFeasibility } from './meal-generator/checkProteinFeasibility.ts';

const apiKey = process.env.OLLAMA_API_KEY;
const model = process.env.OLLAMA_MODEL;


export type ProteinFeasibilityResult =
    | {
          feasible: true;
      }
    | {
          feasible: false;
          maximumProteinPercentage: number;
      };

if (!apiKey) {
    throw new Error('OLLAMA_API_KEY is not configured');
}

if (!model) {
    throw new Error('OLLAMA_MODEL is not configured');
}

const ollamaAiClient = new OllamaAiClient(apiKey, model);

const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/generate-meal') {
        try {
            const body = await readRequestBody(req);
            const input = JSON.parse(body) as GenerateMealInput;

            const feasibility = checkProteinFeasibility(
                input.nutrition,
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

            const result = await generateMeal(input, ollamaAiClient);
            sendJson(res, 200, result);
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

