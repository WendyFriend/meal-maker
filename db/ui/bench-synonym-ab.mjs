// A/B test: does adding synonyms improve a small local model's choice accuracy?
//
// Pipeline per item:
//   1. pull the candidate list from the real database (search_food)
//   2. minimax-m3.1-flash generates synonyms for the CORRECT food only
//   3. small local model picks, WITHOUT synonyms (baseline)
//   4. small local model picks, WITH synonyms appended to each candidate (treatment)
//
// If the treatment is meaningfully better, synonyms are worth the batch job.
// If not, the effort belongs elsewhere.
//
// Usage: node db/ui/bench-synonym-ab.mjs [--limit N] [--local-model NAME] [--cloud-model NAME]
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const OLLAMA = 'http://localhost:11434';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const limit = Number(getArg('limit', '20'));
const localModel = getArg('local-model', 'gemma3:4b');
const cloudModel = getArg('cloud-model', 'minimax-m3.1-flash:cloud');

// 20 items with a defensible "correct" answer. Each entry says how to identify
// the right row, because USDA naming is inconsistent enough that hard-coding
// descriptions would break on any data refresh.
const ITEMS = [
    { query: 'tomatoes',           want: /^tomatoes?, red, ripe, raw/i },
    { query: 'canned tomatoes',    want: /^tomatoes?, red, ripe, canned, packed in tomato juice/i },
    { query: 'milk',               want: /^milk, whole, 3\.25%/i },
    { query: 'onions',             want: /^onions?, raw$/i },
    { query: 'carrots',            want: /^carrots?, raw$/i },
    { query: 'spinach',            want: /^spinach, raw$/i },
    { query: 'potatoes',           want: /^potatoes, flesh and skin, raw$/i },
    { query: 'rice',               want: /^rice, white, long-grain, regular, raw/i },
    { query: 'chicken breast',     want: /^chicken, broilers or fryers, breast, meat only, raw$/i },
    { query: 'beef mince',         want: /^beef, ground, 8[05]% lean/i },
    { query: 'olive oil',          want: /^oil, olive, salad or cooking$/i },
    { query: 'bread',              want: /^bread, white, commercial$/i },
    { query: 'flour',              want: /^flour, wheat, all-purpose, enriched, bleached$/i },
    { query: 'butter',             want: /^butter, salted$/i },
    { query: 'cheddar',            want: /^cheese, cheddar( \(|$)/i },
    { query: 'yogurt',             want: /^yogurt, plain, whole milk$/i },
    { query: 'banana',             want: /^bananas?, raw$/i },
    { query: 'lentils',            want: /^lentils, raw$/i },
    { query: 'oats',               want: /^oats$/i },
    { query: 'peanut butter',      want: /^peanut butter, (smooth|creamy)/i },
];

// --- database -----------------------------------------------------------
const dbUrl = process.env.NUTRITION_DATABASE_URL;
if (!dbUrl) {
    console.error('NUTRITION_DATABASE_URL is not set. Run with: node --env-file=.env ...');
    process.exit(1);
}
const parsed = new URL(dbUrl);

function query(sql) {
    return new Promise((resolve, reject) => {
        const child = execFile(
            PSQL,
            [
                '-h', parsed.hostname,
                '-p', parsed.port || '5432',
                '-U', decodeURIComponent(parsed.username),
                '-d', parsed.pathname.replace(/^\//, ''),
                '-t', '-A', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-',
            ],
            {
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
                windowsHide: true,
            },
            (error, stdout, stderr) => {
                if (error) return reject(new Error(stderr.trim() || error.message));
                const text = stdout.trim();
                if (!text) return resolve([]);
                try {
                    resolve(JSON.parse(text));
                } catch (e) {
                    reject(new Error(`bad psql output: ${text.slice(0, 200)}`));
                }
            },
        );
        child.stdin.on('error', () => {});
        child.stdin.end(sql);
    });
}

async function candidatesFor(q) {
    // 25 rather than 8: search_food's top-8 frequently omits the intuitively
    // correct food (e.g. raw tomatoes, white bread), which made half the A/B
    // items unscorable. No picker can choose what it is not shown.
    const rows = await query(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
            SELECT fdc_id, description, round(kcal) AS kcal, score
            FROM search_food('${q.replace(/'/g, "''")}', 25)
        ) t;`,
    );
    return rows;
}

// --- llm helpers --------------------------------------------------------
async function chat(model, messages, options = {}, extra = {}) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            // Cloud models (minimax, glm, deepseek) reason by default and will
            // spend the whole num_predict budget on thinking, leaving content
            // empty. 'think' must be top-level, not inside options.
            think: false,
            ...extra,
            options: { temperature: 0, num_ctx: 4096, ...options },
            messages,
        }),
    });
    if (!response.ok) throw new Error(`${model}: HTTP ${response.status} ${await response.text()}`);
    const data = await response.json();
    const content = (data.message?.content ?? '').trim();
    if (!content && (data.message?.thinking ?? '').length > 0) {
        throw new Error(`${model}: empty content, ${data.message.thinking.length} chars thinking`);
    }
    return content;
}

const SYN_SYSTEM =
    'You generate search terms for a recipe app. A user will type these into a ' +
    'search box to find an ingredient.\n' +
    'Give 4 to 8 SHORT terms, each 1 to 4 words, that real people would type.\n' +
    'Include regional and colloquial names (British, American, Australian) when ' +
    'the food has them.\n' +
    'IMPORTANT: keep any qualifier the food has. If it is canned, dried, ' +
    'frozen, powdered or condensed, every term must say so - never give the ' +
    'bare noun alone.\n' +
    'Reply with ONLY a JSON array of strings.';

async function synonyms(description) {
    const raw = await chat(
        cloudModel,
        [
            { role: 'system', content: SYN_SYSTEM },
            { role: 'user', content: `USDA food description: ${description}\n\nTerms:` },
        ],
        { num_predict: 300 },
        {
            format: {
                type: 'object',
                properties: { terms: { type: 'array', items: { type: 'string' } } },
                required: ['terms'],
            },
        },
    );

    let list = [];
    try {
        const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
        const p = JSON.parse(cleaned);
        if (Array.isArray(p)) list = p;
        else if (Array.isArray(p.terms)) list = p.terms;
    } catch {
        const m = raw.match(/\[[\s\S]*\]/);
        if (m) {
            try {
                list = JSON.parse(m[0]);
            } catch {
                list = [];
            }
        }
    }

    const VAGUE = /^(vegetable|fruit|food|meat|veggie|veggies|thing)$/i;
    return list
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && t.length <= 40 && !VAGUE.test(t))
        .filter((t) => !/\brecipe\b/.test(t))
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 6);
}

const PICK_SYSTEM =
    'You pick ONE numbered option for a bare ingredient word.\n' +
    'Rule: reject any option whose description contains canned, frozen, dried, ' +
    'dehydrated, powdered, juice, mashed, cooked, boiled, fried, baked, ' +
    'roasted, spread, condensed, or sweetened.\n' +
    'From what remains, pick the plainest, most ordinary everyday version.\n' +
    'Reply with ONLY the number.';

async function pick(query, candidates, synonymsByIndex, showSynonyms) {
    const list = candidates
        .map((c, i) => {
            const syn = synonymsByIndex.get(c.fdc_id);
            const suffix = showSynonyms && syn?.length ? `   (also: ${syn.join(', ')})` : '';
            return `${i + 1}. ${c.description}${suffix}`;
        })
        .join('\n');

    const raw = await chat(
        localModel,
        [
            { role: 'system', content: PICK_SYSTEM },
            { role: 'user', content: `Ingredient: ${query}\n\n${list}\n\nNumber:` },
        ],
        { num_predict: 16 },
    );

    const m = raw.match(/\d+/);
    const idx = m ? Number(m[0]) - 1 : -1;
    return { pick: candidates[idx] ?? null, raw };
}

// --- run ---------------------------------------------------------------
const items = ITEMS.slice(0, limit);
console.log(`items: ${items.length}   synonyms: ${cloudModel}   picker: ${localModel}\n`);

let baseCorrect = 0;
let synCorrect = 0;
let covered = 0;
const rows = [];

for (const item of items) {
    const candidates = await candidatesFor(item.query);
    const correct = candidates.find((c) => item.want.test(c.description));

    if (!correct) {
        rows.push(`${'SKIP'}  ${item.query.padEnd(16)} (no expected food in candidate list)`);
        continue;
    }
    covered++;

    // Synonyms are generated for the correct food AND every candidate, so the
    // treatment gives the picker real signal rather than just labelling one row.
    const synByIndex = new Map();
    for (const candidate of candidates) {
        try {
            synByIndex.set(candidate.fdc_id, await synonyms(candidate.description));
        } catch (error) {
            console.log(`    synonym error (${candidate.description.slice(0, 30)}): ${error.message.slice(0, 70)}`);
            synByIndex.set(candidate.fdc_id, []);
        }
    }

    const baseline = await pick(item.query, candidates, synByIndex, false);
    const treatment = await pick(item.query, candidates, synByIndex, true);

    const baseOk = baseline.pick?.fdc_id === correct.fdc_id;
    const synOk = treatment.pick?.fdc_id === correct.fdc_id;
    if (baseOk) baseCorrect++;
    if (synOk) synCorrect++;

    const mark =
        baseOk === synOk ? (baseOk ? 'ok/ok  ' : 'miss/miss') : synOk ? 'MISS->OK' : 'OK->MISS';

    rows.push(
        `${mark}  ${item.query.padEnd(16)} want: ${correct.description.slice(0, 34)}\n` +
            `         base: ${baseline.pick?.description?.slice(0, 60) ?? 'none'}\n` +
            `         syn : ${treatment.pick?.description?.slice(0, 60) ?? 'none'}\n` +
            `         syns for correct: ${(synByIndex.get(correct.fdc_id) ?? []).join(', ') || '(none)'}`,
    );
}

console.log(rows.join('\n'));
console.log(
    `\n=== ${covered} items scored ===` +
        `\n  baseline (no synonyms): ${baseCorrect}/${covered}` +
        `\n  with synonyms        : ${synCorrect}/${covered}` +
        `\n  delta                : ${synCorrect - baseCorrect >= 0 ? '+' : ''}${synCorrect - baseCorrect}`,
);
