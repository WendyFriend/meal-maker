import { createServer, ServerResponse } from 'node:http';
import type { GenerateMealRequest } from '../shared/types/types.ts';
import { handleGenerateMealOllama } from './meal-generator/algorithms/generateMealOllama.ts';
import { searchNutrition } from './nutrition/searchNutrition.ts';

const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/generate-meal') {
        try {
            const body = await readRequestBody(req);
            const input = JSON.parse(body) as GenerateMealRequest;

            const result = await handleGenerateMealOllama(input);

            sendJson(res, result.status, result.body);
        } catch (error) {
            console.error('server.ts error:', error);

            sendJson(res, 500, {
                message: 'Failed to generate meal',
            });
        }

        return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/nutrition') {
        const result = await searchNutrition(url.searchParams.get('q') ?? '');

        sendJson(res, result.status, result.body);

        return;
    }

    sendJson(res, 404, {
        error: 'Not found',
    });
});

server.listen(3010, () => {
    console.log('Server listening on http://localhost:3010');
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
