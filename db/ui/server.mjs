// Local data-explorer server for the nutrition database.
//
// Deliberately standalone: it does NOT touch the React app, so "don't use the
// database yet" still holds. No npm dependencies either — queries run through
// the psql binary that ships with the Postgres install, which avoids adding a
// pg client just to look at data.
//
// Usage:  node --env-file=.env db/ui/server.mjs
// Then:   http://localhost:5199

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.NUTRITION_UI_PORT) || 5199;
const PSQL =
    process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

const dbUrl = process.env.NUTRITION_DATABASE_URL;
if (!dbUrl) {
    console.error('NUTRITION_DATABASE_URL is not set.');
    process.exit(1);
}

// Node's URL parser handles the password/port correctly, unlike the shell.
const parsed = new URL(dbUrl);
const dbUser = decodeURIComponent(parsed.username);
const dbPassword = decodeURIComponent(parsed.password);
const dbHost = parsed.hostname;
const dbPort = parsed.port || '5432';
const dbName = parsed.pathname.replace(/^\//, '');

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Runs SQL and returns parsed JSON.
 *
 * Variables are passed with psql's -v and referenced as :'name' in the SQL, so
 * psql performs the quoting. Never string-concatenate user input into SQL.
 */
function query(sql, vars = {}) {
    const args = [
        '-h', dbHost,
        '-p', dbPort,
        '-U', dbUser,
        '-d', dbName,
        '-t', '-A',
        '-q',
        '-v', 'ON_ERROR_STOP=1',
    ];

    for (const [key, value] of Object.entries(vars)) {
        args.push('-v', `${key}=${value}`);
    }

    // SQL goes over stdin rather than -c: psql only substitutes :'var'
    // variables for -f / stdin input, not for -c, which fails with
    // 'syntax error at or near ":"'.
    args.push('-f', '-');

    return new Promise((resolve, reject) => {
        const child = execFile(
            PSQL,
            args,
            {
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, PGPASSWORD: dbPassword },
                windowsHide: true,
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr.trim() || error.message));
                    return;
                }
                const text = stdout.trim();
                if (text === '') {
                    resolve([]);
                    return;
                }
                try {
                    resolve(JSON.parse(text));
                } catch {
                    reject(new Error(`Unexpected psql output: ${text.slice(0, 300)}`));
                }
            },
        );

        child.stdin.on('error', () => {});
        child.stdin.end(sql);
    });
}

const routes = {
    // High-level counts for the header.
    async stats() {
        return query(`
            SELECT json_build_object(
                'foods',         (SELECT count(*) FROM food),
                'nutrientRows',  (SELECT count(*) FROM food_nutrient),
                'nutrients',     (SELECT count(*) FROM nutrient),
                'portions',      (SELECT count(*) FROM food_portion),
                'core',          (SELECT count(*) FROM food WHERE scope = 'core'),
                'review',        (SELECT count(*) FROM food WHERE scope = 'review'),
                'excluded',      (SELECT count(*) FROM food WHERE scope = 'excluded'),
                'flags',         (SELECT count(*) FROM antinutrient_flag)
            );
        `);
    },

    // Scope breakdown for the donut/bar.
    async scopes() {
        return query(`
            SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.foods DESC), '[]')
            FROM (
                SELECT scope, count(*)::int AS foods
                FROM food GROUP BY scope
            ) t;
        `);
    },

    // Kcal distribution across core foods — the visualisation of the nutrition
    // data itself rather than of the metadata.
    async kcalHistogram() {
        return query(`
            SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.bucket), '[]')
            FROM (
                SELECT
                    (width_bucket(kcal, 0, 900, 18))::int AS bucket,
                    least(round(kcal)::int, 900)::int     AS bucket_from,
                    count(*)::int                          AS foods
                FROM v_food_core
                WHERE scope = 'core' AND kcal IS NOT NULL
                GROUP BY 1, 2
            ) t;
        `);
    },

    // Per-compound flag tallies for the anti-nutrient chart.
    async compounds() {
        return query(`
            SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.flagged DESC), '[]')
            FROM (
                SELECT
                    c.slug,
                    c.name,
                    c.evidence_level AS "evidenceLevel",
                    count(*) FILTER (WHERE f.verdict = 'flagged')::int    AS flagged,
                    count(*) FILTER (WHERE f.verdict = 'unassessed')::int AS unassessed,
                    count(*) FILTER (WHERE f.verdict = 'dismissed')::int  AS dismissed
                FROM antinutrient_compound c
                LEFT JOIN antinutrient_flag f ON f.compound_slug = c.slug
                GROUP BY c.slug, c.name, c.evidence_level
            ) t;
        `);
    },

    // Food search via the synonym-aware function, falling back to trigram.
    async search(_params, vars) {
        // include=excluded lets the explorer reach foods the default scope
        // hides. Sugars and molasses live in 'Sweets', which is excluded from
        // normal search, so without this a query like "icing sugar" looks
        // broken when it is really a scoping choice.
        const includeExcluded = vars.include === 'excluded';
        return query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]')
             FROM (
                SELECT * FROM search_food_syn(:'q', 25)
                UNION ALL
                SELECT v.fdc_id, v.description, v.category, v.scope, v.kcal,
                       v.protein_g, v.fat_g, v.carb_g, 0.9::real, 'synonym:excluded'::text
                FROM food_synonym s
                JOIN v_food_core v ON v.fdc_id = s.fdc_id
                WHERE ${includeExcluded ? 'true' : 'v.scope = \'excluded\''}
                  AND lower(s.term) = lower(unaccent(trim(:'q')))
             ) t;`,
            vars,
        );
    },

    // How a query resolves: exact / ambiguous / fuzzy / weak / no match.
    async resolution(_params, vars) {
        return query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]')
             FROM (SELECT * FROM search_resolution(:'q')) t;`,
            vars,
        );
    },

    // Foods in 'excluded' scope that still carry a synonym matching the query.
    // Surfaces the "it works but scoping hides it" case explicitly.
    async excludedMatches(_params, vars) {
        return query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                SELECT v.fdc_id AS id, v.description, v.category,
                       s.term, s.origin
                FROM food_synonym s
                JOIN v_food_core v ON v.fdc_id = s.fdc_id
                WHERE v.scope = 'excluded'
                  AND lower(s.term) = lower(unaccent(trim(:'q')))
                ORDER BY s.term
                LIMIT 10
             ) t;`,
            vars,
        );
    },

    // Synonym coverage and quality counters for the header.
    async synonymStats() {
        return query(`
            SELECT json_build_object(
                'terms',      (SELECT count(*) FROM food_synonym),
                'foods',      (SELECT count(DISTINCT fdc_id) FROM food_synonym),
                'bareNouns',  (SELECT count(*) FROM food_synonym WHERE is_bare_noun),
                'rejected',   (SELECT count(*) FROM synonym_reject),
                'jobDone',    (SELECT count(*) FROM synonym_job WHERE status = 'done'),
                'jobEmpty',   (SELECT count(*) FROM synonym_job WHERE status = 'empty'),
                'jobFailed',  (SELECT count(*) FROM synonym_job WHERE status = 'failed'),
                'jobPending', (SELECT count(*) FROM food WHERE scope = 'core'
                               AND NOT EXISTS (SELECT 1 FROM synonym_job j WHERE j.fdc_id = food.fdc_id))
            );
        `);
    },

    // Rejection reasons, so filter behaviour is visible rather than opaque.
    async rejections() {
        return query(`
            SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.n DESC), '[]')
            FROM (SELECT reason, count(*)::int AS n FROM synonym_reject GROUP BY reason) t;
        `);
    },

    // Full detail for one food.
    async food(_params, vars) {
        const [header, nutrients, portions, flags, synonyms] = await Promise.all([
            query(
                `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                    SELECT f.fdc_id AS id, f.description, f.scope,
                           fc.description AS category, f.data_type AS "dataType"
                    FROM food f
                    LEFT JOIN food_category fc ON fc.id = f.food_category_id
                    WHERE f.fdc_id = :'id'::int
                ) t;`,
                vars,
            ),
            query(
                `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                    SELECT n.name, n.unit, fn.amount::float AS amount
                    FROM food_nutrient fn
                    JOIN nutrient n USING (nutrient_nbr)
                    WHERE fn.fdc_id = :'id'::int
                    ORDER BY n.name
                ) t;`,
                vars,
            ),
            query(
                `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                    SELECT description, amount::float AS amount,
                           gram_weight::float AS grams
                    FROM food_portion
                    WHERE fdc_id = :'id'::int
                    ORDER BY gram_weight
                ) t;`,
                vars,
            ),
            query(
                `SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.verdict, t.compound), '[]') FROM (
                    SELECT c.slug AS compound, c.name, c.mitigation,
                           af.verdict, af.confidence, af.note
                    FROM antinutrient_flag af
                    JOIN antinutrient_compound c ON c.slug = af.compound_slug
                    WHERE af.fdc_id = :'id'::int
                ) t;`,
                vars,
            ),
            query(
                `SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.term), '[]') FROM (
                    SELECT term, origin, is_bare_noun
                    FROM food_synonym
                    WHERE fdc_id = :'id'::int
                ) t;`,
                vars,
            ),
        ]);

        return { header, nutrients, portions, flags, synonyms };
    },

    // Browse foods flagged (or unassessed) for one compound.
    async byCompound(_params, vars) {
        return query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                SELECT f.fdc_id AS id, f.description,
                       fc.description AS category, f.scope,
                       af.verdict, af.confidence
                FROM antinutrient_flag af
                JOIN food f USING (fdc_id)
                JOIN food_category fc ON fc.id = f.food_category_id
                WHERE af.compound_slug = :'compound'
                  AND af.verdict = :'verdict'
                ORDER BY f.description
                LIMIT 300
             ) t;`,
            vars,
        );
    },
};

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    try {
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const html = await readFile(join(here, 'index.html'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        const name = url.pathname.replace(/^\/api\//, '');
        const handler = routes[name];
        if (!handler) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }

        const params = Object.fromEntries(url.searchParams);
        const body = await handler(params, params);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
    } catch (error) {
        console.error(`${url.pathname}:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, 'localhost', () => {
    console.log(`Nutrition explorer: http://localhost:${PORT}`);
    console.log(`Database: ${dbName} @ ${dbHost}:${dbPort}`);
});
