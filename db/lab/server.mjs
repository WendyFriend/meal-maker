// Viewer for the independent lab database (nutrition_lab).
//
// Read/write, but deliberately narrow: it shows the copied foods, their
// synonyms, their nutrients, and the source-of-truth table. It does not touch
// the main app or the main database.
//
// Usage:  node --env-file=.env db/lab/server.mjs
// Then:   http://localhost:5198
//
// Same psql-based approach as db/ui/server.mjs: no npm dependencies, and
// variables reach SQL through psql's own quoting rather than string
// concatenation.

import { createServer } from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAll } from './rules.mjs';
import { buildCrowds, checkCrowds, expand, rootRows } from './crowds.mjs';
import { confidenceFor } from './confidence.mjs';

const PORT = Number(process.env.LAB_UI_PORT) || 5198;
const PSQL =
    process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const DB = process.env.LAB_DATABASE || 'nutrition_lab';

// The table is capped: the lab now holds the whole USDA core, and serialising
// every food with its synonyms on every keystroke is tens of megabytes. The UI
// says when it is showing a capped view.
const PAGE_SIZE = 300;

const dbUrl = process.env.NUTRITION_DATABASE_URL;
if (!dbUrl) {
    console.error('NUTRITION_DATABASE_URL is not set.');
    process.exit(1);
}

// The lab lives on the same server; only the database name differs.
const parsed = new URL(dbUrl);
const dbUser = decodeURIComponent(parsed.username);
const dbPassword = decodeURIComponent(parsed.password);
const dbHost = parsed.hostname;
const dbPort = parsed.port || '5432';

const here = dirname(fileURLToPath(import.meta.url));

// naming.mjs status and stop files; a run other than the main one adds a suffix.
const namingFile = (run, kind) =>
    join(here, 'out', kind === 'status' ? `naming${run ? `-${run}` : ''}-status.json` : `naming${run ? `-${run}` : ''}.stop`);

/** True while a process with this id exists. */
function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/** Runs SQL, returning parsed JSON. Values go in via psql -v, never concatenated. */
function query(sql, vars = {}) {
    const args = [
        '-h', dbHost,
        '-p', dbPort,
        '-U', dbUser,
        '-d', DB,
        '-t', '-A', '-q',
        '-v', 'ON_ERROR_STOP=1',
    ];

    for (const [key, value] of Object.entries(vars)) {
        args.push('-v', `${key}=${value}`);
    }

    // SQL over stdin: psql only substitutes :'var' for stdin/-f, not for -c.
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

// Crowds are built by the global naming rules (rules.mjs) and organised in
// crowds.mjs, which also guarantees every count matches what opens.

// Food names change only when the lab data is edited, so the result is kept
// briefly rather than rebuilt for every click.
const INDEX_TTL_MS = 5 * 60 * 1000;
let crowdIndex = null;

async function loadCrowdIndex() {
    if (crowdIndex && Date.now() - crowdIndex.loadedAt < INDEX_TTL_MS) {
        return crowdIndex;
    }

    const { foods: rows, categories } = await query(`
        SELECT json_build_object(
            'foods', coalesce((
                SELECT json_agg(json_build_array(f.fdc_id, f.description, c.description))
                FROM food f LEFT JOIN food_category c ON c.id = f.food_category_id
            ), '[]'),
            'categories', coalesce((SELECT json_agg(description) FROM food_category), '[]')
        );
    `);

    crowdIndex = { crowds: buildCrowds(parseAll(rows, categories)), loadedAt: Date.now() };
    return crowdIndex;
}

const routes = {
    async stats() {
        return query(`
            SELECT json_build_object(
                'foods',      (SELECT count(*) FROM food),
                'synonyms',   (SELECT count(*) FROM food_synonym),
                'bareNouns',  (SELECT count(*) FROM food_synonym WHERE is_bare_noun),
                'nutrients',  (SELECT count(*) FROM nutrient),
                'categories', (SELECT count(*) FROM food_category),
                'filled',     (SELECT count(*) FROM food WHERE source_of_truth IS NOT NULL)
            );
        `);
    },

    /**
     * The naming run (naming.mjs): how far each phase has got, and what it is
     * doing now. Counts come from the database, so they are right even while
     * the worker is stopped.
     */
    async namingstatus() {
        const counts = await query(
            `SELECT json_build_object(
                'foods', (SELECT count(*) FROM food),
                'named', (SELECT count(*) FROM food WHERE common_name_raw IS NOT NULL),
                'namedGemma', (SELECT count(*) FROM food WHERE common_name_gemma IS NOT NULL),
                'commonTerms', (SELECT count(DISTINCT common_name_raw) FROM food),
                'commonDecided', (SELECT count(*) FROM name_arbitration WHERE kind = 'common'),
                'commonContested', (SELECT count(*) FROM (SELECT 1 FROM food WHERE common_name_raw IS NOT NULL
                                    GROUP BY common_name_raw HAVING count(*) > 1) g),
                'nounTerms', (SELECT count(DISTINCT noun_raw) FROM food),
                'nounDecided', (SELECT count(*) FROM name_arbitration WHERE kind = 'noun'),
                'nounContested', (SELECT count(*) FROM (SELECT 1 FROM food WHERE noun_raw IS NOT NULL
                                  GROUP BY noun_raw HAVING count(*) > 1) g),
                'alt2Done', (SELECT count(*) FROM food WHERE common_name_2_raw IS NOT NULL),
                'alt2Named', (SELECT count(*) FROM food WHERE common_name_2_raw <> ''),
                'alt2Terms', (SELECT count(DISTINCT common_name_2_raw) FROM food WHERE common_name_2_raw <> ''),
                'alt2Decided', (SELECT count(*) FROM name_arbitration WHERE kind = 'common2'),
                'alt2Contested', (SELECT count(*) FROM (SELECT 1 FROM food WHERE common_name_2_raw <> ''
                                  GROUP BY common_name_2_raw HAVING count(*) > 1) g),
                'alt3Eligible', (SELECT count(*) FROM food WHERE common_name_2 IS NOT NULL),
                'alt3Done', (SELECT count(*) FROM food WHERE common_name_3_raw IS NOT NULL AND common_name_2 IS NOT NULL),
                'alt3Named', (SELECT count(*) FROM food WHERE common_name_3_raw <> ''),
                'alt3Terms', (SELECT count(DISTINCT common_name_3_raw) FROM food WHERE common_name_3_raw <> ''),
                'alt3Decided', (SELECT count(*) FROM name_arbitration WHERE kind = 'common3'),
                'alt3Contested', (SELECT count(*) FROM (SELECT 1 FROM food WHERE common_name_3_raw <> ''
                                  GROUP BY common_name_3_raw HAVING count(*) > 1) g)
            );`,
        );
        const read = async (run) => {
            let worker = null;
            try {
                worker = JSON.parse(await readFile(namingFile(run, 'status'), 'utf8'));
            } catch {
                // never run yet
            }
            const running = worker ? isAlive(worker.pid) && !['done', 'paused', 'error'].includes(worker.phase) : false;
            return { worker, running };
        };
        const main = await read('');
        const gemma = await read('gemma');
        return { ...counts, ...main, gemma };
    },

    /** Starts (or resumes) a naming run, unless it is already running. run=gemma for the gemma columns. */
    async namingstart({ run = '', hibernate }) {
        if (!['', 'gemma'].includes(run)) throw new Error(`unknown run ${run}`);
        const current = await routes.namingstatus();
        if ((run ? current.gemma : current).running) return { started: false, reason: 'already running' };
        await unlink(namingFile(run, 'stop')).catch(() => {});
        const args = [
            '--env-file=.env',
            'db/lab/naming.mjs',
            ...(run ? ['--run', run] : []),
            ...(hibernate === '1' ? ['--hibernate-when-done'] : []),
        ];
        const child = spawn(process.execPath, args, {
            cwd: join(here, '..', '..'),
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.unref();
        return { started: true, pid: child.pid };
    },

    /** Asks the worker to stop after the model call in hand. */
    async namingpause({ run = '' }) {
        if (!['', 'gemma'].includes(run)) throw new Error(`unknown run ${run}`);
        await writeFile(namingFile(run, 'stop'), new Date().toISOString());
        return { pausing: true };
    },

    /**
     * Random foods with a model-made common name and what the resolver returns
     * for it, all precomputed by sample-common-names.mjs (resolving 300 names
     * live takes about a minute, far too slow for opening a tab).
     */
    async simplefoods() {
        const file = JSON.parse(await readFile(join(here, 'out', 'common-names.json'), 'utf8'));
        if (!file.rows.every((r) => 'result' in r)) {
            throw new Error(
                'common-names.json has not been resolved yet: run node --env-file=.env db/lab/sample-common-names.mjs --resolve-only',
            );
        }
        return file.rows.map((r) => ({
            item: r.item,
            common: r.common ?? '',
            result: r.result,
            same: r.same,
            tier: r.tier,
            via: r.via,
        }));
    },

    /**
     * Food list, optionally filtered. Each row carries its own synonyms.
     *
     * Returns { total, rows }: the table is capped at PAGE_SIZE because the full
     * set is now the whole USDA core, and rendering every row would send tens of
     * megabytes of JSON for a query that most often wants to look at a handful.
     */
    async foods({ q, won }) {
        // Fixed snippets chosen by name: the value never reaches the SQL text.
        const wonFilter =
            {
                common: 'f.common_name IS NOT NULL',
                noun: 'f.noun IS NOT NULL',
                any: '(f.common_name IS NOT NULL OR f.noun IS NOT NULL)',
            }[won] ?? 'true';
        return query(
            `WITH hay AS (
                SELECT f.fdc_id,
                       lower(f.description || ' | ' || coalesce(f.source_of_truth, '') || ' | '
                             || coalesce((SELECT string_agg(s.term, ' | ') FROM food_synonym s
                                          WHERE s.fdc_id = f.fdc_id), '')) AS h
                FROM food f
            ),
            -- The whole phrase, as typed.
            phrase AS (
                SELECT fdc_id FROM hay
                WHERE :'q' = '' OR h LIKE '%' || lower(:'q') || '%'
            ),
            -- When the phrase is nowhere ("wagyu tenderloin"), look the words up
            -- on their own. Same scoring as resolve_food: a rare word counts
            -- for more than a common one.
            toks AS (
                SELECT DISTINCT t AS tok
                FROM regexp_split_to_table(lower(:'q'), '[^a-z0-9]+') t
                WHERE length(t) >= 2
                  AND t NOT IN ('and', 'or', 'of', 'the', 'with', 'in', 'a', 'an')
            ),
            tok_hits AS (
                SELECT t.tok, hay.fdc_id
                FROM toks t
                JOIN hay ON hay.h LIKE ANY (
                    ARRAY(SELECT '%' || v || '%' FROM unnest(query_variants(t.tok)) v)
                )
            ),
            tok_weight AS (
                SELECT t.tok,
                       ln((SELECT count(*) FROM food)::real
                          / greatest(count(DISTINCT h.fdc_id), 1)) + 1 AS w
                FROM toks t
                LEFT JOIN tok_hits h ON h.tok = t.tok
                GROUP BY t.tok
            ),
            cover AS (
                SELECT h.fdc_id, (sum(w.w) / (SELECT sum(w) FROM tok_weight))::real AS cov
                FROM tok_hits h
                JOIN tok_weight w ON w.tok = h.tok
                GROUP BY h.fdc_id
            ),
            -- Foods holding every word if there are any, else the best partial
            -- covers, so a misspelt word still leaves the right neighbourhood.
            by_words AS (
                SELECT fdc_id, cov FROM cover
                WHERE (SELECT count(*) FROM toks) >= 2
                  AND NOT EXISTS (SELECT 1 FROM phrase)
                  AND (cov >= 0.999 OR NOT EXISTS (SELECT 1 FROM cover WHERE cov >= 0.999))
            ),
            match_all AS (
                SELECT fdc_id, 1.0::real AS cov FROM phrase
                UNION ALL
                SELECT fdc_id, cov FROM by_words
            ),
            -- Optionally only foods that won a name in arbitration.
            match AS (
                SELECT m.* FROM match_all m JOIN food f USING (fdc_id) WHERE ${wonFilter}
            )
            SELECT json_build_object(
                'total', (SELECT count(*) FROM match),
                'rows', coalesce((
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT
                            f.fdc_id,
                            f.description,
                            f.source_of_truth,
                            c.description AS category,
                            f.data_type,
                            f.scope,
                            (
                                SELECT coalesce(json_agg(s.term ORDER BY s.term), '[]')
                                FROM food_synonym s
                                WHERE s.fdc_id = f.fdc_id
                            ) AS synonyms,
                            f.common_name,
                            f.common_name_raw,
                            f.noun,
                            f.noun_raw,
                            f.common_name_2,
                            f.common_name_2_raw,
                            f.common_name_3,
                            f.common_name_3_raw,
                            f.common_name_gemma,
                            f.noun_gemma,
                            EXISTS (
                                SELECT 1 FROM food_synonym s
                                WHERE s.fdc_id = f.fdc_id AND s.is_bare_noun
                            ) AS owns_bare,
                            (
                                SELECT count(*) FROM food_nutrient fn
                                WHERE fn.fdc_id = f.fdc_id
                            ) AS nutrient_rows
                        FROM food f
                        JOIN match m ON m.fdc_id = f.fdc_id
                        LEFT JOIN food_category c ON c.id = f.food_category_id
                        ORDER BY
                            m.cov DESC,
                            -- Closest first: the food IS the query, then starts with it,
                            -- then has it in its name, then only matches through a
                            -- synonym or source text. Shorter names win within a rank.
                            CASE
                                WHEN :'q' = '' THEN 0
                                WHEN trim(split_part(lower(f.description), ',', 1)) = ANY (
                                         ARRAY[lower(:'q'), lower(:'q') || 's', lower(:'q') || 'es',
                                               regexp_replace(lower(:'q'), 'y$', 'ies'),
                                               regexp_replace(lower(:'q'), 'o$', 'oes')]
                                     ) THEN 1
                                WHEN lower(f.description) ~ ('^' || regexp_replace(lower(:'q'), '([^a-z0-9 ])', '\\\\\\1', 'g') || '(s|es)?\\M') THEN 2
                                WHEN lower(split_part(f.description, ',', 1)) ~ ('\\m' || regexp_replace(lower(:'q'), '([^a-z0-9 ])', '\\\\\\1', 'g') || '(s|es)?\\M') THEN 3
                                WHEN lower(f.description) ~ ('\\m' || regexp_replace(lower(:'q'), '([^a-z0-9 ])', '\\\\\\1', 'g') || '(s|es)?\\M') THEN 4
                                ELSE 5
                            END,
                            length(f.description),
                            f.description
                        LIMIT ${PAGE_SIZE}
                    ) t
                ), '[]')
            );`,
            { q: q ?? '' },
        );
    },

    /**
     * The word a person would actually type, and what owns it right now.
     *
     * This is the interesting view: it shows the head noun of each food's
     * description, whether any synonym claims that word, and whether the claim
     * is a bare noun (which is what makes a lookup confident).
     */
    async heads({ q }) {
        return query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                WITH heads AS (
                    SELECT
                        trim(split_part(lower(f.description), ',', 1)) AS head,
                        f.fdc_id,
                        f.description
                    FROM food f
                )
                SELECT
                    h.head,
                    h.description,
                    (
                        SELECT coalesce(json_agg(s.term ORDER BY s.term), '[]')
                        FROM food_synonym s
                        WHERE s.fdc_id = h.fdc_id
                          AND lower(s.term) IN (
                              h.head,
                              regexp_replace(h.head, 'ies$', 'y'),
                              regexp_replace(h.head, 'oes$', 'o'),
                              regexp_replace(h.head, 'ses$', 's'),
                              CASE WHEN h.head ~ '[^s]s$' THEN left(h.head, -1) ELSE h.head END
                          )
                    ) AS own_terms,
                    (
                        SELECT f2.description
                        FROM food_synonym s
                        JOIN food f2 ON f2.fdc_id = s.fdc_id
                        WHERE s.is_bare_noun
                          AND lower(s.term) IN (
                              h.head,
                              regexp_replace(h.head, 'ies$', 'y'),
                              regexp_replace(h.head, 'oes$', 'o'),
                              regexp_replace(h.head, 'ses$', 's'),
                              CASE WHEN h.head ~ '[^s]s$' THEN left(h.head, -1) ELSE h.head END
                          )
                        LIMIT 1
                    ) AS bare_owner
                FROM heads h
                WHERE :'q' = '' OR h.head ILIKE '%' || :'q' || '%'
                ORDER BY h.head, h.description
                LIMIT 300
            ) t;`,
            { q: q ?? '' },
        );
    },

    /**
     * What the app's resolver would answer for this word.
     *
     * This runs the real resolve_food() installed by 4_search.sql, so the answer
     * shown here is the same one the app acts on. That is the point of the lab:
     * judging a synonym by eye is guesswork, judging it by what the resolver
     * returns is not.
     */
    async resolve({ q }) {
        const term = (q ?? '').trim();
        if (term === '') return { term: '', results: [] };

        const results = await query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]')
             FROM resolve_food(:'q', 6) t;`,
            { q: term },
        );

        return { term, results };
    },

    /**
     * EXPERIMENTAL. Like resolve, but through resolve_food_conf() (16_resolve_conf.sql):
     * the same candidates in the same order, with extra signal columns, plus an
     * estimate of how likely the top result is the one wanted (confidence.mjs).
     * The normal resolve route and the app are untouched.
     */
    async resolveconf({ q }) {
        const term = (q ?? '').trim();
        if (term === '') return { term: '', results: [], confidence: null };

        const results = await query(
            `SELECT coalesce(json_agg(row_to_json(t)), '[]')
             FROM resolve_food_conf(:'q', 8) t;`,
            { q: term },
        );

        return { term, results, confidence: await confidenceFor(term, results) };
    },

    /**
     * Crowded base nouns, and what is inside each. See crowds.mjs: every
     * count here is the size of what opening it lists.
     *
     *   no path            -> base nouns with `min`+ foods, largest first
     *   path=egg           -> its groups ("whole egg"...) plus "other egg"
     *   path=egg>whole egg -> the foods in that group
     */
    async crowdtree({ path, q, min }) {
        const { crowds } = await loadCrowdIndex();

        if (!path) {
            const rows = rootRows(crowds, {
                min: Math.max(2, Number(min) || 2),
                filter: (q ?? '').trim().toLowerCase(),
            });
            return { path: '', rows, foods: [], more: 0 };
        }

        return expand(crowds, path);
    },

    /** Self-check: every count matches what opens. Empty = healthy. */
    async crowdcheck() {
        const { crowds } = await loadCrowdIndex();
        return { roots: crowds.roots.size, problems: checkCrowds(crowds) };
    },

    /** Nutrient detail for one food. */
    async foodNutrients({ id }) {
        return query(
            `SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.name), '[]') FROM (
                SELECT n.name, n.unit, fn.amount
                FROM food_nutrient fn
                JOIN nutrient n ON n.nutrient_nbr = fn.nutrient_nbr
                WHERE fn.fdc_id = :'id'::int
                  AND fn.amount IS NOT NULL
            ) t;`,
            { id: String(id ?? '') },
        );
    },

    async sourceOfTruth() {
        return query(`
            SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
                SELECT fdc_id, description, source_of_truth
                FROM food
                WHERE source_of_truth IS NOT NULL
                ORDER BY description
            ) t;
        `);
    },
};

const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const html = await readFile(join(here, 'index.html'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        // Generated thumbnails, served as plain static files (db/lab/thumb_studio.py
        // writes them as <fdc_id>.webp). Missing ones 404; the UI hides them on error.
        if (url.pathname.startsWith('/thumbnails/')) {
            const name = url.pathname.slice('/thumbnails/'.length);
            if (!/^\d+\.webp$/.test(name)) {
                json(res, 400, { error: 'Bad thumbnail name' });
                return;
            }
            try {
                const data = await readFile(join(here, 'thumbnails', name));
                res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-cache' });
                res.end(data);
            } catch {
                res.writeHead(404);
                res.end();
            }
            return;
        }

        if (!url.pathname.startsWith('/api/')) {
            json(res, 404, { error: 'Not found' });
            return;
        }

        const name = url.pathname.slice('/api/'.length);
        const handler = routes[name];

        if (!handler) {
            json(res, 404, { error: `No such endpoint: ${name}` });
            return;
        }

        const params = Object.fromEntries(url.searchParams.entries());
        const data = await handler(params);
        json(res, 200, data);
    } catch (error) {
        console.error(`${url.pathname}:`, error.message);
        json(res, 500, { error: error.message });
    }
});

// LAB_HOST=0.0.0.0 opens it to the local network (e.g. to view on a phone).
// The lab has no login, so leave it on 127.0.0.1 otherwise.
server.listen(PORT, process.env.LAB_HOST || '127.0.0.1', () => {
    console.log(`Lab viewer: http://localhost:${PORT}`);
    console.log(`Database:   ${DB}`);
});
