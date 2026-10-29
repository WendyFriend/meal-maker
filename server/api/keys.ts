// API keys for /api/v1.
//
// Keys are in an `api` schema. On the production server that schema is in its
// own database (API_DATABASE_URL -> mealmaker_api), because nutrition_lab is
// replaced wholesale on every data deploy and the keys must survive that. On a
// dev machine it can sit inside nutrition_lab (the default), which is never
// replaced there; script/deploy-data.sh leaves the `api` schema out of the
// dump, so dev keys never reach production.
//
// Only a SHA-256 hash of each key is stored. The key itself is shown once, when
// it is created (script/api-keys.ts), and cannot be recovered afterwards.
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

export const SCOPES = ['foods', 'parse', 'voice', 'generate'] as const;
export type Scope = (typeof SCOPES)[number];

export type ApiKey = {
    id: number;
    name: string;
    prefix: string;
    scopes: Scope[];
    ratePerMinute: number;
};

const API_DB = process.env.NUTRITION_LAB_DATABASE || 'nutrition_lab';
// A revoked key keeps working for at most this long on a running server.
const CACHE_MS = 30_000;

let pool: pg.Pool | null = null;

/** The keys database: API_DATABASE_URL, or else nutrition_lab on NUTRITION_DATABASE_URL's server. */
export function apiDb(): pg.Pool {
    if (pool) return pool;

    let connectionString = process.env.API_DATABASE_URL;
    if (!connectionString) {
        const base = process.env.NUTRITION_DATABASE_URL;
        if (!base) throw new Error('Set API_DATABASE_URL (or NUTRITION_DATABASE_URL) for API keys');
        const url = new URL(base);
        url.pathname = `/${API_DB}`;
        connectionString = url.toString();
    }

    pool = new pg.Pool({ connectionString, max: 4, idleTimeoutMillis: 30_000 });
    pool.on('error', (error) => console.error('api database pool error:', error.message));
    return pool;
}

/** Creates the tables if they are missing. Safe to run on every start. */
export async function ensureApiSchema(): Promise<void> {
    await apiDb().query(`
        CREATE SCHEMA IF NOT EXISTS api;
        CREATE TABLE IF NOT EXISTS api.api_key (
            id              serial PRIMARY KEY,
            name            text        NOT NULL,
            prefix          text        NOT NULL,
            key_hash        text        NOT NULL UNIQUE,
            scopes          text[]      NOT NULL,
            rate_per_minute integer     NOT NULL DEFAULT 60,
            created_at      timestamptz NOT NULL DEFAULT now(),
            last_used_at    timestamptz,
            revoked_at      timestamptz
        );
        CREATE TABLE IF NOT EXISTS api.api_request (
            id      bigserial   PRIMARY KEY,
            key_id  integer     REFERENCES api.api_key(id),
            method  text        NOT NULL,
            route   text        NOT NULL,
            status  integer     NOT NULL,
            ms      integer     NOT NULL,
            at      timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS api_request_key_at_idx ON api.api_request (key_id, at);
    `);
}

export function hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

/** A new random key, e.g. "mm_live_4fJ...". `env` only labels it; any key works on any server that has it. */
export function generateKey(env: 'live' | 'dev'): string {
    return `mm_${env}_${randomBytes(24).toString('base64url')}`;
}

export async function createKey(options: {
    name: string;
    scopes: Scope[];
    ratePerMinute?: number;
    env?: 'live' | 'dev';
}): Promise<{ key: string; id: number }> {
    const key = generateKey(options.env ?? 'live');
    const { rows } = await apiDb().query<{ id: number }>(
        `INSERT INTO api.api_key (name, prefix, key_hash, scopes, rate_per_minute)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [options.name, key.slice(0, 12), hashKey(key), options.scopes, options.ratePerMinute ?? 60],
    );
    return { key, id: rows[0].id };
}

const cache = new Map<string, { key: ApiKey | null; at: number }>();

/** The key's record, or null when it is unknown or revoked. */
export async function lookupKey(key: string): Promise<ApiKey | null> {
    const hash = hashKey(key);
    const cached = cache.get(hash);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.key;

    const { rows } = await apiDb().query<{
        id: number;
        name: string;
        prefix: string;
        scopes: string[];
        rate_per_minute: number;
    }>(
        `SELECT id, name, prefix, scopes, rate_per_minute FROM api.api_key
         WHERE key_hash = $1 AND revoked_at IS NULL`,
        [hash],
    );
    const row = rows[0];
    const found: ApiKey | null = row
        ? {
              id: row.id,
              name: row.name,
              prefix: row.prefix,
              scopes: row.scopes.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s)),
              ratePerMinute: row.rate_per_minute,
          }
        : null;
    cache.set(hash, { key: found, at: Date.now() });
    return found;
}

/** Records a request. Fire-and-forget: logging must never slow or fail a request. */
export function logRequest(keyId: number | null, method: string, route: string, status: number, ms: number) {
    apiDb()
        .query(
            `WITH logged AS (
                 INSERT INTO api.api_request (key_id, method, route, status, ms) VALUES ($1, $2, $3, $4, $5)
             )
             UPDATE api.api_key SET last_used_at = now() WHERE id = $1`,
            [keyId, method, route, status, Math.round(ms)],
        )
        .catch((error: Error) => console.error('api request log failed:', error.message));
}

// ---------------------------------------------------------------------------
// Rate limiting: a token bucket per key, in memory (one server process).
// ---------------------------------------------------------------------------

const buckets = new Map<number, { tokens: number; at: number }>();

/** Takes one request from the key's allowance. Returns what the headers report. */
export function takeToken(key: ApiKey): { allowed: boolean; remaining: number; resetSeconds: number } {
    const capacity = key.ratePerMinute;
    const perMs = capacity / 60_000;
    const now = Date.now();
    const bucket = buckets.get(key.id) ?? { tokens: capacity, at: now };

    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) * perMs);
    bucket.at = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    buckets.set(key.id, bucket);

    return {
        allowed,
        remaining: Math.floor(bucket.tokens),
        // Seconds until the next request would be allowed.
        resetSeconds: bucket.tokens >= 1 ? 0 : Math.ceil((1 - bucket.tokens) / perMs / 1000),
    };
}
