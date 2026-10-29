import { createServer, ServerResponse } from 'node:http';
import type { GenerateMealRequest } from '../shared/types/types.ts';
import { handleGenerateMealOllama } from './meal-generator/algorithms/generateMealOllama.ts';
import { matchIngredientsRoute } from './nutrition/matchIngredients.ts';
import { searchNutrition } from './nutrition/searchNutrition.ts';
import { parseRecipeRoute } from './nutrition/parseRecipeRoute.ts';
import { transcribeRoute } from './nutrition/transcribe.ts';
import { sendThumbnail } from './thumbnails.ts';
import { handleApiV1 } from './api/v1.ts';
import { ensureApiSchema } from './api/keys.ts';

const server = createServer(async (req, res) => {
    // The keyed public API (docs/api.md). The routes below are the web app's own.
    if (await handleApiV1(req, res, new URL(req.url ?? '/', 'http://localhost'))) return;

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

    if (req.method === 'POST' && url.pathname === '/api/match-ingredients') {
        let body: unknown;

        try {
            body = JSON.parse(await readRequestBody(req));
        } catch {
            body = undefined;
        }

        const result = await matchIngredientsRoute(body);

        sendJson(res, result.status, result.body);

        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/nutrition') {
        const result = await searchNutrition(url.searchParams.get('q') ?? '');

        sendJson(res, result.status, result.body);

        return;
    }

    // Speech-to-text for the recipe builder. Raw audio body, JSON {text} back.
    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
        const result = await transcribeRoute(req);

        sendJson(res, result.status, result.body);

        return;
    }

    // Generated food thumbnails (db/lab/thumb_studio.py). Most foods don't
    // have one yet; the client treats a 404 here as "no image".
    if (req.method === 'GET' && url.pathname.startsWith('/api/thumbnails/')) {
        await sendThumbnail(res, url.pathname.slice('/api/thumbnails/'.length));

        return;
    }

    // "Speak your ingredients" → resolved database rows, ready for the meal
    // generator. Nutrition comes from the local database, never from a model.
    if (req.method === 'POST' && url.pathname === '/api/parse-recipe') {
        let body: unknown;

        try {
            body = JSON.parse(await readRequestBody(req));
        } catch {
            body = undefined;
        }

        const result = await parseRecipeRoute(body);

        sendJson(res, result.status, result.body);

        return;
    }

    sendJson(res, 404, {
        error: 'Not found',
    });
});

// Dev: the API listens on 3020 and Vite (on 3010) proxies /api to it.
// Deployments set PORT/HOST. --lan listens on every interface, so other
// machines on the home network can use this one as their API server.
const port = Number(process.env.PORT) || 3020;
const host = process.argv.includes('--lan') ? '0.0.0.0' : process.env.HOST || 'localhost';

server.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
});

// API keys live in their own database; create its tables if this is a fresh one.
// Without it the app still runs, only /api/v1's keyed endpoints refuse requests.
ensureApiSchema().catch((error: Error) =>
    console.error(`API key database unavailable (${error.message}); keyed /api/v1 endpoints will fail.`),
);

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
