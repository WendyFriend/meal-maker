// Picks random foods, asks a local model for each one's common name, and saves
// the result for the lab's "Simple foods" tab, which runs the common names
// through the resolver.
//
//   node --env-file=.env db/lab/sample-common-names.mjs [--count 300] [--batch 25]
//   node --env-file=.env db/lab/sample-common-names.mjs --resolve-only
//
// Writes db/lab/out/common-names.json, including what the resolver returns for
// each common name. Resolving 300 names takes about a minute, so it is done
// here once instead of every time the tab opens. --resolve-only re-runs just
// that step on the existing file (after a resolver change). Nothing is written
// to the database.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const COUNT = arg('count', 300);
const BATCH = arg('batch', 25);
const MODEL = process.env.COMMON_NAME_MODEL || 'nemotron-3-nano:4b';
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const PSQL = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const DB = process.env.LAB_DATABASE || 'nutrition_lab';
const OUT = 'db/lab/out/common-names.json';

const url = new URL(process.env.NUTRITION_DATABASE_URL);
const psql = (sql) =>
    execFileSync(
        PSQL,
        ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', DB, '-At'],
        { input: sql, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, maxBuffer: 64 * 1024 * 1024 },
    ).toString();

const prompt = (names) => `Food database entries:
${names.map((f, i) => `${i + 1}. ${f}`).join('\n')}

For each entry, what would a shopper type into a search box to find it? Give ONE short common name per entry.

Use the main food word plus only the words that change which product they would pick up: a kind or cut (split peas, cheddar cheese, brown rice, chicken breast, bottom round steak) or the form it is sold in (canned, frozen, dried).

Leave out everything else:
- defaults the shopper assumes: colour that is normal for the food, salt or seasoning, raw for fresh produce, "regular", "plain" unless it matters
- lab and packaging detail: solids and liquids, drained, enriched, percentages, trimmed, grades, separable lean
- how it was cooked for testing: boiled, roasted, braised, cooked

Examples:
Corn, sweet, yellow, canned, whole kernel, drained solids -> canned corn
Spinach, frozen, chopped or leaf, unprepared -> frozen spinach
Bananas, raw -> bananas
Beef, chuck, top blade, steak, separable lean only, choice, cooked, broiled -> top blade steak

Reply with a numbered list, one lowercase common name per line, in the same order as the entries, nothing else:
1. common name`;

// Words the prompt asks to leave out but a small model sometimes keeps.
const COOKING = /^(raw|cooked|boiled|roasted|braised|broiled|grilled|plain|fresh) /;

/** Runs every common name through resolve_food and stores the top answer. */
function resolveAll(rows) {
    const items = JSON.stringify(rows.map((r, n) => ({ n, fdc_id: r.fdc_id, common: r.common ?? '' })));
    const tag = '$items_json$';
    if (items.includes(tag)) throw new Error('names contain the quote tag');
    const resolved = JSON.parse(
        psql(`SELECT coalesce(json_agg(json_build_object(
                    'n', x.n, 'result', r.description, 'same', r.fdc_id = x.fdc_id,
                    'tier', r.tier, 'via', r.matched_via) ORDER BY x.n), '[]')
              FROM json_to_recordset(${tag}${items}${tag}::json) AS x(n integer, fdc_id integer, common text)
              LEFT JOIN LATERAL resolve_food(x.common, 1) r ON x.common <> '';`).trim(),
    );
    for (const r of resolved) Object.assign(rows[r.n], { result: r.result, same: r.same ?? false, tier: r.tier, via: r.via });
}

if (process.argv.includes('--resolve-only')) {
    const file = JSON.parse(readFileSync(OUT, 'utf8'));
    const t0 = Date.now();
    resolveAll(file.rows);
    writeFileSync(OUT, JSON.stringify({ ...file, resolved: new Date().toISOString() }, null, 1));
    console.log(`resolved ${file.rows.length} names in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
    process.exit(0);
}

const foods = JSON.parse(
    psql(`SELECT json_agg(t) FROM (
        SELECT fdc_id, description FROM food
        ORDER BY random()
        LIMIT ${COUNT}
    ) t;`).trim(),
);

const started = Date.now();
const rows = [];
for (let i = 0; i < foods.length; i += BATCH) {
    const batch = foods.slice(i, i + BATCH);
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
            model: MODEL,
            stream: false,
            think: false,
            options: { temperature: 0, num_ctx: 8192 },
            messages: [{ role: 'user', content: prompt(batch.map((f) => f.description)) }],
        }),
    });
    const body = await res.json();
    const lines = (body.message?.content ?? '')
        .trim()
        .split('\n')
        .filter((l) => /^\s*\d+\./.test(l))
        .map((l) => l.replace(/^\s*\d+\.\s*/, '').trim().toLowerCase().replace(COOKING, ''));
    batch.forEach((f, k) => rows.push({ fdc_id: f.fdc_id, item: f.description, common: lines[k] || null }));
    console.log(`batch ${i / BATCH + 1}: ${lines.length}/${batch.length} names`);
}

console.log('resolving common names...');
resolveAll(rows);
mkdirSync('db/lab/out', { recursive: true });
writeFileSync(OUT, JSON.stringify({ model: MODEL, created: new Date().toISOString(), resolved: new Date().toISOString(), rows }, null, 1));
console.log(`${rows.length} foods, ${rows.filter((r) => r.common).length} named, in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${OUT}`);
