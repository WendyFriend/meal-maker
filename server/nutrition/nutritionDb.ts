// Read access to the local nutrition database (PostgreSQL, SR Legacy).
//
// The dev app historically read nutrition from the USDA FoodData Central API,
// which is rate-limited and needs a key. This module points the same data at the
// local import instead, so a lookup is a query rather than a network call.
//
// This reads the `nutrition_lab` database, not `nutrition`: the lab holds the
// same USDA food and nutrient data (mirrored 1:1, same fdc_ids) plus the naming
// work done there -- arbitrated common names/nouns and a search resolver tuned
// against them (db/lab/4_search.sql) -- so a query here gets the better match
// without the app needing its own copy of that work. `resolve_food_detailed`
// is installed in nutrition_lab as the same wrapper function `nutrition` uses
// (it just calls `resolve_food`, which nutrition_lab's is the improved one);
// db/lab/eval-role.sql-style setup also copied the antinutrient_* tables
// over, since that function joins them. db/lab/thumb_studio.py writes
// `db/lab/thumbnails/<fdc_id>.webp`, served by getThumbnailUrl() below.
// NUTRITION_DATABASE_URL still supplies the host/user/password; only the
// database name is overridden, so other tools that read it for the `nutrition`
// db (db/ui/*, db/verify.ps1, ...) are unaffected.
//
// Queries go through a `pg` connection pool. Statements are written with psql's
// :'name' variables (as the db/ SQL tooling is), and runQuery turns those into
// $1, $2 ... parameters, so values are never spliced into the SQL text.
import pg from 'pg';
import type { ConfidenceRow } from '../../db/lab/confidence.mjs';

const NUTRITION_LAB_DB = process.env.NUTRITION_LAB_DATABASE || 'nutrition_lab';

// The columns `resolve_food_detailed` returns (db/lab/12_resolve_detailed.sql's
// install of it; same body as the one in the `nutrition` db, just riding on
// nutrition_lab's own, better `resolve_food`), plus `data_type` joined in by
// the query below -- that one isn't part of the function's own result.
export type NutritionRow = {
    fdc_id: number;
    description: string;
    category: string | null;
    scope: string;
    data_type: string | null;
    kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    carb_g: number | null;
    sugar_g: number | null;
    fiber_g: number | null;
    sat_fat_g: number | null;
    monofat_g: number | null;
    polyfat_g: number | null;
    trans_fat_g: number | null;
    cholesterol_mg: number | null;
    sodium_mg: number | null;
    potassium_mg: number | null;
    calcium_mg: number | null;
    iron_mg: number | null;
    magnesium_mg: number | null;
    phosphorus_mg: number | null;
    zinc_mg: number | null;
    vitamin_a_ug: number | null;
    vitamin_c_mg: number | null;
    vitamin_d_ug: number | null;
    vitamin_e_mg: number | null;
    vitamin_k_ug: number | null;
    thiamin_mg: number | null;
    riboflavin_mg: number | null;
    niacin_mg: number | null;
    b6_mg: number | null;
    folate_ug: number | null;
    b12_ug: number | null;
    water_g: number | null;
    ash_g: number | null;
    caffeine_mg: number | null;
    antinutrients: unknown;
    score: number;
    matched_via: string;
    tier: 'confident' | 'ambiguous' | 'probable' | 'weak';
};

/** True when the local database is configured at all. */
export function isNutritionDbConfigured(): boolean {
    return Boolean(process.env.NUTRITION_DATABASE_URL);
}

type RunOptions = {
    /** Values referenced as :'name' inside the SQL. */
    vars?: Record<string, string>;
};

/**
 * Runs a query and returns the single JSON value it selects.
 *
 * Every query here must return one JSON value (typically
 * `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (...) t`). That keeps
 * the result shape uniform whatever the query.
 */
async function runQuery<T>(sql: string, { vars = {} }: RunOptions = {}): Promise<T> {
    const values: string[] = [];
    const text = sql.replace(/:'([a-z_]+)'/g, (_match, name: string) => {
        if (!(name in vars)) throw new Error(`query variable :'${name}' was not given`);
        values.push(vars[name]);
        return `$${values.length}`;
    });

    const result = await getPool().query(text, values);
    const first = result.rows[0] as Record<string, unknown> | undefined;
    const value = first ? Object.values(first)[0] : undefined;
    return (value ?? []) as T;
}

let pool: pg.Pool | null = null;

/** One pool per process, on NUTRITION_DATABASE_URL with the database name swapped. */
function getPool(): pg.Pool {
    if (pool) return pool;

    const dbUrl = process.env.NUTRITION_DATABASE_URL;
    if (!dbUrl) throw new Error('NUTRITION_DATABASE_URL is not set');

    const url = new URL(dbUrl);
    url.pathname = `/${NUTRITION_LAB_DB}`;
    pool = new pg.Pool({
        connectionString: url.toString(),
        max: Number(process.env.NUTRITION_DB_POOL_SIZE) || 8,
        idleTimeoutMillis: 30_000,
    });
    // An idle connection dropping (e.g. a database restart) must not crash the server.
    pool.on('error', (error) => console.error('nutrition database pool error:', error.message));
    return pool;
}

export type FoodDetail = {
    fdc_id: number;
    description: string;
    category: string | null;
    scope: string | null;
    data_type: string | null;
    /** Every nutrient the food has, per 100 g, in USDA number order. */
    nutrients: { nbr: string; name: string; unit: string; amount: number }[];
    /** Other names this food is found by (food_synonym). */
    synonyms: string[];
};

/** One food by id with all its nutrients, or null when there is no such food. */
export async function foodById(fdcId: number): Promise<FoodDetail | null> {
    const rows = await runQuery<FoodDetail[]>(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
            SELECT f.fdc_id, f.description, c.description AS category, f.scope, f.data_type,
                   coalesce((SELECT json_agg(json_build_object(
                                 'nbr', n.nutrient_nbr, 'name', n.name, 'unit', n.unit, 'amount', fn.amount)
                                 ORDER BY length(n.nutrient_nbr), n.nutrient_nbr)
                             FROM food_nutrient fn JOIN nutrient n USING (nutrient_nbr)
                             WHERE fn.fdc_id = f.fdc_id AND fn.amount IS NOT NULL), '[]') AS nutrients,
                   coalesce((SELECT json_agg(s.term ORDER BY s.term)
                             FROM food_synonym s WHERE s.fdc_id = f.fdc_id), '[]') AS synonyms
            FROM food f
            LEFT JOIN food_category c ON c.id = f.food_category_id
            WHERE f.fdc_id = :'id'::integer
        ) t;`,
        { vars: { id: String(Math.trunc(fdcId)) } },
    );
    return rows[0] ?? null;
}

/**
 * Rows from `resolve_food_conf` (db/lab/16_resolve_conf.sql): the same ranking
 * as `resolve_food` plus the signals the confidence model scores. Only the lab
 * database has the function, so callers treat a failure as "no estimate".
 */
export function resolveFoodConf(term: string, maxCandidates = 8): Promise<ConfidenceRow[]> {
    return runQuery<ConfidenceRow[]>(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM resolve_food_conf(:'q', :'max') t;`,
        { vars: { q: term, max: String(maxCandidates) } },
    );
}

/**
 * Resolves one spoken food name to ranked database rows.
 *
 * `resolve_food_detailed` handles punctuation and plurals server-side, so
 * "tomatoes." and "tomato" both reach the same record.
 */
export function resolveFood(term: string, maxCandidates = 8): Promise<NutritionRow[]> {
    return runQuery<NutritionRow[]>(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
            SELECT rfd.*, f.data_type
            FROM resolve_food_detailed(:'q', :'max') rfd
            JOIN food f ON f.fdc_id = rfd.fdc_id
        ) t;`,
        { vars: { q: term, max: String(maxCandidates) } },
    );
}
