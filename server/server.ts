import { createServer } from 'node:http';
import { OllamaAiClient } from './ai/OllamaAiClient.js';
import { generateMeal } from './meal-generator/generateMeal.js';
import type { GenerateMealInput } from '../src/features/meal-generator/types.js';
import process from 'node:process';

const apiKey = process.env.OLLAMA_API_KEY;
const model = process.env.OLLAMA_MODEL;

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

            const result = await generateMeal(input, ollamaAiClient);

            res.writeHead(200, {
                'Content-Type': 'application/json',
            });

            res.end(JSON.stringify(result));
        } catch (error) {
            console.error('server.ts error: ' + error);

            res.writeHead(500, {
                'Content-Type': 'application/json',
            });

            res.end(
                JSON.stringify({
                    error: 'Failed to generate meal',
                }),
            );
        }
        return;
    }

    res.writeHead(404, {
        'Content-Type': 'application/json',
    });

    res.end(
        JSON.stringify({
            error: 'Not found',
        }),
    );
});

server.listen(3001, () => {
    console.log('Server listening on http://localhost:3001');
});

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
