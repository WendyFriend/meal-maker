// The public MealMaker API, version 1: everything under /api/v1.
//
// Documented for client developers in docs/api.md; keep the two in step.
//
//   GET  /api/v1                      endpoint index                      public
//   GET  /api/v1/health               server and database status          public
//   GET  /api/v1/docs                 usage guide (markdown or ?format=json) any key
//   GET  /api/v1/thumbnails/<id>.webp food picture                        public
//   GET  /api/v1/me                   the calling key                     any key
//   GET  /api/v1/foods/search         ranked foods for typed text         foods
//   GET  /api/v1/foods/<id>           one food, every nutrient            foods
//   POST /api/v1/foods/resolve        best food for each of many names    foods
//   POST /api/v1/parse                sentence -> ingredients + goals     parse
//   POST /api/v1/transcribe           audio -> text                       voice
//   POST /api/v1/voice                audio -> text -> ingredients+goals  voice
//   POST /api/v1/meals/generate       ingredients + goals -> recipe       generate
//
// Keys are sent as "Authorization: Bearer <key>" (or "X-API-Key: <key>") and
// carry scopes and a per-minute limit; see server/api/keys.ts.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GenerateMealRequest } from '../../shared/types/types.ts';
import { thumbnailUrl } from '../../shared/nutrition/thumbnail.ts';
import { handleGenerateMealOllama } from '../meal-generator/algorithms/generateMealOllama.ts';
import {
    foodById,
    isNutritionDbConfigured,
    resolveFood,
    type NutritionRow,
} from '../nutrition/nutritionDb.ts';
import { certaintyFor } from '../nutrition/parseSpokenRequest.ts';
import { parseRecipeRoute } from '../nutrition/parseRecipeRoute.ts';
import { readAudioBody, transcribeAudio } from '../nutrition/transcribe.ts';
import { sendThumbnail } from '../thumbnails.ts';
import { loadGuide } from './guide.ts';
import { logRequest, lookupKey, takeToken, type ApiKey, type Scope } from './keys.ts';

const PREFIX = '/api/v1';
const MAX_JSON_BYTES = 256 * 1024;
const MAX_SEARCH_LIMIT = 25;
const MAX_RESOLVE_TERMS = 25;

type Reply = { status: number; body: unknown };

class ApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const fail = (status: number, code: string, message: string): never => {
    throw new ApiError(status, code, message);
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/* A search/resolve hit: per-100 g nutrition plus how it was matched. */
function toFood(row: NutritionRow) {
    return {
        fdcId: row.fdc_id,
        description: row.description,
        category: row.category,
        thumbnailUrl: `${PREFIX}${thumbnailUrl(row.fdc_id).replace(/^\/api/, '')}`,
        match: { tier: row.tier, score: row.score, matchedVia: row.matched_via },
        per100g: {
            kcal: row.kcal,
            proteinG: row.protein_g,
            carbsG: row.carb_g,
            fatG: row.fat_g,
            sugarG: row.sugar_g,
            fibreG: row.fiber_g,
            satFatG: row.sat_fat_g,
            sodiumMg: row.sodium_mg,
            cholesterolMg: row.cholesterol_mg,
            potassiumMg: row.potassium_mg,
            calciumMg: row.calcium_mg,
            ironMg: row.iron_mg,
            vitaminCMg: row.vitamin_c_mg,
        },
        antinutrients: row.antinutrients,
    };
}

async function searchFoods(q: string, limit: number) {
    const [rows, certainty] = await Promise.all([resolveFood(q, limit), certaintyFor(q)]);
    return {
        query: q,
        results: rows.map(toFood),
        // The confidence model scores the top result only: the chance it is the food meant.
        topConfidence:
            rows[0] && certainty && certainty.fdcId === rows[0].fdc_id
                ? { p: certainty.p, band: certainty.band }
                : null,
    };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_JSON_BYTES) fail(413, 'BODY_TOO_LARGE', 'Request bodies are limited to 256 KB.');
        chunks.push(chunk as Buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        return fail(400, 'INVALID_JSON', 'The request body is not valid JSON.');
    }
}

async function readAudio(req: IncomingMessage): Promise<Buffer> {
    try {
        return await readAudioBody(req);
    } catch {
        return fail(413, 'AUDIO_TOO_LARGE', 'Audio clips are limited to 12 MB.');
    }
}

function keyFrom(req: IncomingMessage): string | null {
    const auth = req.headers.authorization;
    if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    const header = req.headers['x-api-key'];
    return typeof header === 'string' && header.trim() ? header.trim() : null;
}

function requireDb() {
    if (!isNutritionDbConfigured()) fail(503, 'DATABASE_UNAVAILABLE', 'The nutrition database is not configured.');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

type Route = {
    method: 'GET' | 'POST';
    /** Matched against the path after /api/v1. */
    pattern: RegExp;
    /** Null for public routes. */
    scope: Scope | 'any' | null;
    /** Label for logs; ids are replaced by ":id". */
    name: string;
    handle: (ctx: { req: IncomingMessage; res: ServerResponse; url: URL; match: RegExpExecArray; key: ApiKey | null }) => Promise<Reply | 'sent'>;
};

const ROUTES: Route[] = [
    {
        method: 'GET',
        pattern: /^\/?$/,
        scope: null,
        name: '/',
        handle: async () => ({
            status: 200,
            body: {
                name: 'MealMaker API',
                version: 1,
                docs: `${PREFIX}/docs`,
                endpoints: ROUTES.map((r) => `${r.method} ${PREFIX}${r.name === '/' ? '' : r.name}${r.scope ? `  [${r.scope}]` : '  [public]'}`),
            },
        }),
    },
    {
        method: 'GET',
        pattern: /^\/health$/,
        scope: null,
        name: '/health',
        handle: async () => {
            let database = false;
            if (isNutritionDbConfigured()) {
                try {
                    database = (await resolveFood('apple', 1)).length > 0;
                } catch {
                    database = false;
                }
            }
            return { status: database ? 200 : 503, body: { ok: database, database } };
        },
    },
    {
        method: 'GET',
        pattern: /^\/docs$/,
        scope: 'any',
        name: '/docs',
        handle: async ({ req, res, url }) => {
            const guide = await loadGuide(
                ROUTES.map((r) => ({
                    method: r.method,
                    path: `${PREFIX}${r.name === '/' ? '' : r.name}`,
                    scope: r.scope === null ? 'public' : r.scope === 'any' ? 'any key' : r.scope,
                })),
            );
            if (!guide) return fail(503, 'DOCS_UNAVAILABLE', 'The usage guide is missing from this server.');

            const etag = `"${guide.version}"`;
            // Agents can poll cheaply: an unchanged guide answers 304 with no body.
            if (req.headers['if-none-match'] === etag) {
                res.writeHead(304, { ETag: etag });
                res.end();
                return 'sent';
            }
            res.setHeader('ETag', etag);
            res.setHeader('Cache-Control', 'no-cache');
            if (url.searchParams.get('format') === 'json') {
                return { status: 200, body: guide };
            }
            res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Guide-Version': guide.version });
            res.end(guide.markdown);
            return 'sent';
        },
    },
    {
        method: 'GET',
        pattern: /^\/thumbnails\/(\d{1,9}\.webp)$/,
        scope: null,
        name: '/thumbnails/:id.webp',
        handle: async ({ res, match }) => {
            await sendThumbnail(res, match[1]);
            return 'sent';
        },
    },
    {
        method: 'GET',
        pattern: /^\/me$/,
        scope: 'any',
        name: '/me',
        handle: async ({ key }) => ({
            status: 200,
            body: { name: key!.name, prefix: key!.prefix, scopes: key!.scopes, ratePerMinute: key!.ratePerMinute },
        }),
    },
    {
        method: 'GET',
        pattern: /^\/foods\/search$/,
        scope: 'foods',
        name: '/foods/search',
        handle: async ({ url }) => {
            requireDb();
            const q = (url.searchParams.get('q') ?? '').trim();
            if (q.length < 2 || q.length > 100) fail(400, 'INVALID_QUERY', 'Use ?q= with 2 to 100 characters.');
            const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 8));
            return { status: 200, body: await searchFoods(q, limit) };
        },
    },
    {
        method: 'GET',
        pattern: /^\/foods\/(\d{1,9})$/,
        scope: 'foods',
        name: '/foods/:id',
        handle: async ({ match }) => {
            requireDb();
            const food = await foodById(Number(match[1]));
            if (!food) return fail(404, 'NOT_FOUND', 'No food with that id.');
            return {
                status: 200,
                body: {
                    fdcId: food.fdc_id,
                    description: food.description,
                    category: food.category,
                    scope: food.scope,
                    dataType: food.data_type,
                    thumbnailUrl: `${PREFIX}/thumbnails/${food.fdc_id}.webp`,
                    nutrientsPer100g: food.nutrients,
                    synonyms: food.synonyms,
                },
            };
        },
    },
    {
        method: 'POST',
        pattern: /^\/foods\/resolve$/,
        scope: 'foods',
        name: '/foods/resolve',
        handle: async ({ req }) => {
            requireDb();
            const body = (await readJson(req)) as { terms?: unknown; alternatives?: unknown } | null;
            const terms = body?.terms;
            if (
                !Array.isArray(terms) ||
                !terms.length ||
                terms.length > MAX_RESOLVE_TERMS ||
                !terms.every((t) => typeof t === 'string' && t.trim().length >= 2 && t.length <= 100)
            ) {
                fail(400, 'INVALID_TERMS', `Send {"terms": [...]} with 1-${MAX_RESOLVE_TERMS} names of 2-100 characters.`);
            }
            const alternatives = Math.min(5, Math.max(0, Number(body?.alternatives) || 0));
            const results = await Promise.all(
                (terms as string[]).map(async (term) => {
                    const found = await searchFoods(term.trim(), alternatives + 1);
                    return {
                        term,
                        food: found.results[0] ?? null,
                        confidence: found.topConfidence,
                        alternatives: found.results.slice(1),
                    };
                }),
            );
            return { status: 200, body: { results } };
        },
    },
    {
        method: 'POST',
        pattern: /^\/parse$/,
        scope: 'parse',
        name: '/parse',
        handle: async ({ req }) => parseRecipeRoute(await readJson(req)),
    },
    {
        method: 'POST',
        pattern: /^\/transcribe$/,
        scope: 'voice',
        name: '/transcribe',
        handle: async ({ req }) => transcribeAudio(await readAudio(req)),
    },
    {
        method: 'POST',
        pattern: /^\/voice$/,
        scope: 'voice',
        name: '/voice',
        handle: async ({ req }) => {
            const heard = await transcribeAudio(await readAudio(req));
            if (heard.status !== 200) return heard;
            const parsed = await parseRecipeRoute({ text: heard.body.text });
            if (parsed.status !== 200) return { status: parsed.status, body: { text: heard.body.text, ...parsed.body } };
            return { status: 200, body: { text: heard.body.text, ...parsed.body } };
        },
    },
    {
        method: 'POST',
        pattern: /^\/meals\/generate$/,
        scope: 'generate',
        name: '/meals/generate',
        handle: async ({ req }) => {
            const body = (await readJson(req)) as Partial<GenerateMealRequest> | null;
            if (
                !body ||
                !Array.isArray(body.ingredients) ||
                !body.ingredients.length ||
                body.ingredients.length > 20 ||
                !body.ingredients.every((i) => typeof i?.name === 'string' && i.name.trim())
            ) {
                fail(400, 'INVALID_REQUEST', 'Send {"ingredients": [{"name": ...}, ...], "requirements": {...}} with 1-20 ingredients.');
            }
            return handleGenerateMealOllama({
                ingredients: body!.ingredients!,
                requirements: body!.requirements ?? {},
            });
        },
    },
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

/** Handles a request under /api/v1. Returns false when the path is not under it. */
export async function handleApiV1(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

    const started = performance.now();
    // Keys, not origins, are what protect the API, so any site may call it.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key, If-None-Match');
    res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After, ETag, X-Guide-Version');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    const path = url.pathname.slice(PREFIX.length);
    let route: Route | undefined;
    let match: RegExpExecArray | null = null;
    for (const candidate of ROUTES) {
        match = candidate.pattern.exec(path);
        if (match) {
            route = candidate;
            break;
        }
    }

    let key: ApiKey | null = null;
    let status = 500;
    try {
        if (!route || !match) throw new ApiError(404, 'NOT_FOUND', `No endpoint ${path}. GET ${PREFIX} lists them.`);
        if (req.method !== route.method) fail(405, 'METHOD_NOT_ALLOWED', `Use ${route.method} for ${PREFIX}${route.name}.`);

        if (route.scope) {
            const presented = keyFrom(req);
            if (!presented) fail(401, 'API_KEY_REQUIRED', 'Send your key as "Authorization: Bearer <key>".');
            key = await lookupKey(presented!);
            if (!key) fail(401, 'API_KEY_INVALID', 'That API key is not valid or has been revoked.');
            if (route.scope !== 'any' && !key!.scopes.includes(route.scope)) {
                fail(403, 'SCOPE_REQUIRED', `This key lacks the "${route.scope}" scope.`);
            }

            const limit = takeToken(key!);
            res.setHeader('X-RateLimit-Limit', String(key!.ratePerMinute));
            res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
            if (!limit.allowed) {
                res.setHeader('Retry-After', String(limit.resetSeconds));
                fail(429, 'RATE_LIMITED', `Limit is ${key!.ratePerMinute} requests a minute. Retry in ${limit.resetSeconds}s.`);
            }
        }

        const reply = await route.handle({ req, res, url, match, key });
        if (reply === 'sent') {
            status = res.statusCode;
        } else {
            status = reply.status;
            send(res, reply.status, reply.body);
        }
    } catch (error) {
        if (error instanceof ApiError) {
            status = error.status;
            send(res, error.status, { error: { code: error.code, message: error.message } });
        } else {
            console.error(`api ${req.method} ${url.pathname} failed:`, error);
            status = 500;
            if (!res.headersSent) send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } });
        }
    } finally {
        // Public routes are not logged; they are cheap and keyless.
        if (key || route?.scope) logRequest(key?.id ?? null, req.method ?? '', route?.name ?? path, status, performance.now() - started);
    }
    return true;
}
