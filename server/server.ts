import { createServer, ServerResponse } from 'node:http';
import type { GenerateMealRequest } from '../shared/types/types.ts';
import { handleGenerateMealRequest } from './meal-generator/handleGenerateMealRequest.ts';
import { handleIngredientNutrition } from './nutrition/handleIngredientNutrition.ts';
import {
    handleFoodSuggestions,
    handleParseIngredients,
} from './nutrition/handleFoodSearch.ts';

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/food-suggestions') {
        const result = await handleFoodSuggestions(url.searchParams.get('q'));
        sendJson(res, result.status, result.body);
        return;
    }
    if (req.method === 'POST' && url.pathname === '/api/parse-ingredients') {
        let input: unknown;
        try {
            input = JSON.parse(await readRequestBody(req));
        } catch {
            input = undefined;
        }
        const result = await handleParseIngredients(input);
        sendJson(res, result.status, result.body);
        return;
    }
    if (req.method === 'POST' && req.url === '/api/ingredient-nutrition') {
        try {
            const input: unknown = JSON.parse(await readRequestBody(req));
            const result = await handleIngredientNutrition(
                input,
                req.headers['x-meal-generator'],
            );
            sendJson(res, result.status, result.body);
        } catch (error) {
            console.error('Ingredient nutrition lookup failed:', error);
            sendJson(res, 500, {
                message: 'Could not load ingredient nutrition.',
            });
        }
        return;
    }
    if (req.method === 'POST' && req.url === '/api/generate-meal') {
        try {
            const body = await readRequestBody(req);
            const input = JSON.parse(body) as GenerateMealRequest;

            const result = await handleGenerateMealRequest(
                input,
                req.headers['x-meal-generator'],
            );

            sendJson(res, result.status, result.body);
        } catch (error) {
            console.error('server.ts error:', error);

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
