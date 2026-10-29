// Rates synonyms with a local model and stores the scores on food_synonym.
//
//   node --env-file=.env db/lab/rate-synonyms.mjs [--batch 25] [--max-batches 0]
//
// Conservative by design: small batches, one request at a time, only rows that
// come back complete and in range are written, and the rest are left unrated.
// Every batch is written to the database as soon as it is rated, so the viewer
// shows ratings live (refresh the Foods tab).
//
// Rows are taken in a fixed pseudo-random order, so stopping at any point leaves
// a representative sample rated, not just the first foods alphabetically.
//
// Stop it any time with Ctrl+C, or by creating db/lab/out/rate.stop (it finishes
// the batch in hand first). It resumes where it left off: only unrated rows are
// picked up.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const BATCH = arg('batch', 25);
const MAX_BATCHES = arg('max-batches', 0); // 0 = until done or stopped
const MODEL = process.env.RATE_MODEL || 'gemma4:12b';
const RATED_BY = `${MODEL}/prompt1`;
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const PSQL = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const DB = process.env.LAB_DATABASE || 'nutrition_lab';
const STOP_FILE = 'db/lab/out/rate.stop';
const LOG_FILE = 'db/lab/out/rate.log';

const url = new URL(process.env.NUTRITION_DATABASE_URL);
const psql = (sql) =>
    execFileSync(
        PSQL,
        ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1'],
        { input: sql, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, maxBuffer: 64 * 1024 * 1024 },
    ).toString();

mkdirSync('db/lab/out', { recursive: true });
const log = (text) => {
    const line = `${new Date().toISOString()}  ${text}`;
    console.log(line);
    appendFileSync(LOG_FILE, `${line}\n`);
};

const SYSTEM = `You rate search synonyms for a food nutrition database. Each row is: n | official food name | synonym.
For every row give two scores from 1 to 5.

correct: does the synonym really mean this food?
  5 = the same food. 3 = broader or narrower than the food. 1 = a different food.

likely: would an ordinary person type this synonym when looking for the food?
  5 = a short, very common everyday word. 3 = occasional. 1 = nobody would ever type it.

Be strict. Most synonyms should NOT get 5 for likely. Rules:
- Cooking or storage words at the front (raw, grilled, fried, broiled, canned, frozen, cooked) make a phrase unnatural: likely is 2 at most.
- Four or more words: likely is 2 at most.
- A brand, a flavour of one brand, or an exact cut specification: likely is 3 at most.
- Obscure, regional or foreign names: likely is 2 at most, though correct can still be 5.
- A synonym naming a different food, a broader group, or a processed product of the food is not correct.

Examples (food | synonym -> correct/likely):
Potatoes, raw | potatoes -> 5/5
Beef, tongue | beef tongue -> 5/4
Fish, sea bass, mixed species, raw | sea bass -> 5/5
Lamb, shoulder, blade, separable lean and fat, trimmed to 1/4" fat, choice, cooked, broiled | broiled lamb blade -> 4/2
Beef, shoulder steak, boneless, separable lean only, trimmed to 0" fat, choice, cooked, grilled | grilled shoulder steak -> 5/2
Lamb, Australian, imported, fresh, leg, sirloin chops, boneless, raw | raw boneless lamb sirloin chops -> 5/2
Yogurt, Greek, 2% fat, key lime blend, CHOBANI | key lime greek yogurt -> 4/3
Mammy-apple, (mamey), raw | mammy apple -> 5/2
Apple juice, canned | apple -> 1/5
Cheese, cheddar | cheese -> 2/5
Pork, cured, ham, canned | canned sweetened ham glaze -> 1/1
Milk, whole | milk shake -> 1/4

Return one result per row, with the same n.`;

const SCHEMA = {
    type: 'object',
    properties: {
        ratings: {
            type: 'array',
            items: {
                type: 'object',
                properties: { n: { type: 'integer' }, correct: { type: 'integer' }, likely: { type: 'integer' } },
                required: ['n', 'correct', 'likely'],
            },
        },
    },
    required: ['ratings'],
};

const tried = new Set();

function nextBatch() {
    const skip = tried.size ? `AND s.id NOT IN (${[...tried].join(',')})` : '';
    const out = psql(`SELECT coalesce(json_agg(t), '[]') FROM (
        SELECT s.id, f.description AS food, s.term
        FROM food_synonym s JOIN food f USING (fdc_id)
        WHERE s.rating_correct IS NULL AND f.scope <> 'excluded' ${skip}
        ORDER BY md5(s.id::text)
        LIMIT ${BATCH}
    ) t;`).trim();
    return JSON.parse(out);
}

async function rate(rows) {
    const lines = rows.map((r, i) => `${i + 1} | ${r.food} | ${r.term}`).join('\n');
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
            model: MODEL,
            stream: false,
            think: false,
            format: SCHEMA,
            options: { temperature: 0, num_ctx: 8192 },
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: lines }],
        }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    return JSON.parse(body.message.content).ratings;
}

const remaining = () =>
    Number(
        psql(
            `SELECT count(*) FROM food_synonym s JOIN food f USING (fdc_id) WHERE s.rating_correct IS NULL AND f.scope <> 'excluded';`,
        ).trim(),
    );

if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE);
let stopping = false;
process.on('SIGINT', () => {
    stopping = true;
    log('stop requested; finishing this batch');
});

log(`start: model ${MODEL}, batch ${BATCH}, ${remaining()} synonyms unrated`);
let batches = 0;
let written = 0;
let failures = 0;
const started = Date.now();

while (!stopping && !existsSync(STOP_FILE) && (!MAX_BATCHES || batches < MAX_BATCHES)) {
    const rows = nextBatch();
    if (!rows.length) {
        log('nothing left to rate');
        break;
    }
    rows.forEach((r) => tried.add(r.id));
    batches++;

    try {
        const t0 = Date.now();
        const ratings = await rate(rows);
        const good = [];
        for (const x of ratings) {
            const row = rows[x.n - 1];
            const ok = [x.correct, x.likely].every((v) => Number.isInteger(v) && v >= 1 && v <= 5);
            if (row && ok && !good.some((g) => g.id === row.id)) {
                good.push({ id: row.id, correct: x.correct, likely: x.likely });
            }
        }
        // Written straight away: the viewer reads this table, so ratings appear live.
        if (good.length) {
            const values = good.map((g) => `(${g.id}, ${g.correct}, ${g.likely})`).join(',');
            psql(`UPDATE food_synonym s SET rating_correct = v.c, rating_likely = v.l,
                      rated_by = '${RATED_BY}', rated_at = now()
                  FROM (VALUES ${values}) AS v(id, c, l) WHERE s.id = v.id;`);
        }
        written += good.length;
        failures = good.length ? 0 : failures + 1;
        log(`batch ${batches}: ${good.length}/${rows.length} rated in ${((Date.now() - t0) / 1000).toFixed(1)}s (total ${written})`);
    } catch (error) {
        failures++;
        log(`batch ${batches} failed: ${error.message}`);
    }

    if (failures >= 5) {
        log('five failed batches in a row; stopping');
        break;
    }
    await new Promise((r) => setTimeout(r, 500));
}

log(`done: ${written} rated in ${batches} batches, ${((Date.now() - started) / 60000).toFixed(1)} min, ${remaining()} unrated left`);
