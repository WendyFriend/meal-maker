// Pipeline evaluation: synonyms -> chooser, with THREE paths compared.
//
// Design decisions from feedback:
//  * No fixed synonym count. Asking for "6 to 8" makes the model pad weak terms
//    for foods that only have two real names. The prompt asks for genuine terms
//    only, and the filter drops junk afterwards.
//  * Three chooser paths are compared, because most lookups should never need
//    an LLM at all:
//      A  rule only     - match the user's text against generated synonyms
//      B  local model   - small GPU model picks from candidates + synonyms
//      C  cloud flash   - fast cheap cloud model picks from candidates + synonyms
//    The headline number is how often path A alone is right.
//
// Usage: node --env-file=.env db/ui/bench-pipeline.mjs [--limit N]
//        [--local gemma3:4b] [--cloud minimax-m3.1-flash:cloud] [--syn gemma4:cloud]
import { execFile } from 'node:child_process';

const OLLAMA = 'http://localhost:11434';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const limit = Number(arg('limit', '20'));
const localModel = arg('local', 'gemma3:4b');
const cloudModel = arg('cloud', 'minimax-m3.1-flash:cloud');
const synModel = arg('syn', 'gemma4:cloud');
const CANDIDATES = Number(arg('candidates', '10'));

// Each item: the query a user types, and a regex identifying the correct row.
const ITEMS = [
    { query: 'tomatoes',        want: /^tomatoes?, red, ripe, raw/i },
    { query: 'canned tomatoes', want: /^tomatoes?, red, ripe, canned, packed in tomato juice/i },
    { query: 'milk',            want: /^milk, whole, 3\.25%/i },
    { query: 'onions',          want: /^onions?, raw$/i },
    { query: 'carrots',         want: /^carrots?, raw$/i },
    { query: 'spinach',         want: /^spinach, raw$/i },
    { query: 'potatoes',        want: /^potatoes, flesh and skin, raw$/i },
    { query: 'rice',            want: /^rice, white, long-grain, regular, raw/i },
    { query: 'chicken breast',  want: /^chicken, broilers or fryers, breast, meat only, raw$/i },
    { query: 'olive oil',       want: /^oil, olive, salad or cooking$/i },
    { query: 'bread',           want: /^bread, white, commercial$/i },
    { query: 'flour',           want: /^flour, wheat, all-purpose, enriched, bleached$/i },
    { query: 'butter',          want: /^butter, salted$/i },
    { query: 'cheddar',         want: /^cheese, cheddar( \(|$)/i },
    { query: 'yogurt',          want: /^yogurt, plain, whole milk$/i },
    { query: 'banana',          want: /^bananas?, raw$/i },
    { query: 'lentils',         want: /^lentils, raw$/i },
    { query: 'peanut butter',   want: /^peanut butter, smooth, creamy|^peanut butter, creamy/i },
    { query: 'garlic',          want: /^garlic, raw$/i },
    { query: 'avocado',         want: /^avocados?, raw/i },
];

// --- database -----------------------------------------------------------
const dbUrl = process.env.NUTRITION_DATABASE_URL;
if (!dbUrl) {
    console.error('NUTRITION_DATABASE_URL is not set.');
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
                } catch {
                    reject(new Error(`bad psql output: ${text.slice(0, 200)}`));
                }
            },
        );
        child.stdin.on('error', () => {});
        child.stdin.end(sql);
    });
}

// --- ollama -------------------------------------------------------------
async function chat(model, messages, options = {}, extra = {}) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            // Top-level: nested inside options it is silently ignored, and
            // reasoning models then spend the whole budget thinking.
            think: false,
            ...extra,
            options: { temperature: 0, num_ctx: 4096, ...options },
            messages,
        }),
    });
    if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);
    const data = await response.json();
    const content = (data.message?.content ?? '').trim();
    if (!content && (data.message?.thinking ?? '').length > 0) {
        throw new Error(`${model}: thinking only, empty content`);
    }
    return content;
}

function firstJsonArray(text) {
    const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try {
        const whole = JSON.parse(cleaned);
        if (Array.isArray(whole)) return whole;
        if (whole && Array.isArray(whole.terms)) return whole.terms;
    } catch {
        /* scan below */
    }
    const start = cleaned.indexOf('[');
    if (start < 0) return [];

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === '[') depth++;
        else if (ch === ']') {
            depth--;
            if (depth === 0) {
                try {
                    const candidate = JSON.parse(cleaned.slice(start, i + 1));
                    return Array.isArray(candidate) ? candidate : [];
                } catch {
                    return [];
                }
            }
        }
    }
    return [];
}

// No required count: padding to hit a target produces weak terms.
const SYN_SYSTEM =
    'You generate ingredient search terms for a recipe app.\n' +
    'Give the real names people use for this food - regional and colloquial ' +
    'names included (British, American, Australian, Indian).\n' +
    'Give ONLY names that are genuinely used. If the food has just two common ' +
    'names, give two. Do not pad the list with invented or descriptive phrases.\n' +
    'If the food is canned, dried, frozen or powdered, every term must keep ' +
    'that qualifier.\n' +
    'Do not include phrases like "calories", "nutrition" or "vs".\n' +
    'Reply with ONLY a JSON array of strings.';

async function synonyms(description) {
    const raw = await chat(
        synModel,
        [
            { role: 'system', content: SYN_SYSTEM },
            { role: 'user', content: `USDA food description: ${description}\n\nNames:` },
        ],
        { num_predict: 300, temperature: 0.2 },
        {
            format: {
                type: 'object',
                properties: { terms: { type: 'array', items: { type: 'string' } } },
                required: ['terms'],
            },
        },
    );

    const BAD = /\b(calorie|calories|nutrition|nutritional|vs\.?|versus|recipe|how many|what is)\b/i;
    const VAGUE = /^(vegetable|fruit|food|meat|veggie|plant|thing|ingredient)$/i;

    return firstJsonArray(raw)
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && t.length <= 32)
        .filter((t) => !BAD.test(t) && !VAGUE.test(t))
        // Junk shape guard: a real ingredient name is rarely 5+ words.
        .filter((t) => t.split(/\s+/).length <= 4)
        .filter((t, i, a) => a.indexOf(t) === i);
}

const PICK_SYSTEM =
    'You pick ONE numbered option for an ingredient a cook typed.\n' +
    'Each option may list alternative names in brackets - use them to judge.\n' +
    'Reject options whose description contains canned, frozen, dried, ' +
    'dehydrated, powdered, juice, mashed, cooked, boiled, fried, baked, ' +
    'roasted, spread, condensed or sweetened, unless the cook asked for that.\n' +
    'From what remains pick the plainest everyday version.\n' +
    'Reply with ONLY the number.';

async function pick(model, queryText, candidates, synByIndex, showSynonyms) {
    const list = candidates
        .map((c, i) => {
            const syn = synByIndex.get(c.fdc_id) ?? [];
            const suffix = showSynonyms && syn.length ? ` [${syn.join(' / ')}]` : '';
            return `${i + 1}. ${c.description}${suffix}`;
        })
        .join('\n');

    const raw = await chat(
        model,
        [
            { role: 'system', content: PICK_SYSTEM },
            { role: 'user', content: `Ingredient: ${queryText}\n\n${list}\n\nNumber:` },
        ],
        { num_predict: 16 },
    );
    const m = raw.match(/\d+/);
    return candidates[m ? Number(m[0]) - 1 : -1] ?? null;
}

// --- path A: rule only, no model ---------------------------------------
// Mirrors what a real search would do: find candidates whose generated
// synonyms contain the user's text. Returns the winner, or a conflict list.
function rulePick(queryText, candidates, synByIndex) {
    const q = queryText.toLowerCase().replace(/\s+/g, ' ').trim();

    const scored = candidates.map((c) => {
        const syn = synByIndex.get(c.fdc_id) ?? [];
        const desc = c.description.toLowerCase();

        // Exact synonym match is the strongest signal.
        if (syn.includes(q)) return { c, rank: 3, why: 'exact synonym' };
        // Description starts with the query (head-noun match).
        if (desc.startsWith(q)) return { c, rank: 2, why: 'description prefix' };
        // A synonym starts with the query, e.g. "raw tomatoes" for "tomatoes".
        if (syn.some((s) => s.startsWith(q + ' ') || s === q)) {
            return { c, rank: 1, why: 'synonym prefix' };
        }
        return null;
    }).filter(Boolean);

    if (!scored.length) return { pick: null, ambiguous: [], why: 'no match' };

    const best = Math.max(...scored.map((s) => s.rank));
    const top = scored.filter((s) => s.rank === best);

    if (top.length === 1) return { pick: top[0].c, ambiguous: [], why: top[0].why };
    return { pick: null, ambiguous: top.map((t) => t.c), why: `ambiguous (${top.length})` };
}

// --- run ---------------------------------------------------------------
const items = ITEMS.slice(0, limit);
console.log(`items ${items.length} | synonyms ${synModel} | local ${localModel} | cloud ${cloudModel}\n`);

const tally = {
    ruleOk: 0, ruleWrong: 0, ruleAmbiguous: 0, ruleNone: 0,
    localOk: 0, cloudOk: 0, scored: 0, skipped: 0,
    termCounts: [],
};
const rows = [];

for (const item of items) {
    const candidates = await query(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
            SELECT fdc_id, description FROM search_food('${item.query.replace(/'/g, "''")}', ${CANDIDATES})
        ) t;`,
    );

    const correct = candidates.find((c) => item.want.test(c.description));
    if (!correct) {
        tally.skipped++;
        rows.push(`SKIP  ${item.query.padEnd(16)} expected food not in top ${CANDIDATES}`);
        continue;
    }
    tally.scored++;

    const synByIndex = new Map();
    for (const candidate of candidates) {
        try {
            synByIndex.set(candidate.fdc_id, await synonyms(candidate.description));
        } catch {
            synByIndex.set(candidate.fdc_id, []);
        }
    }
    tally.termCounts.push(synByIndex.get(correct.fdc_id)?.length ?? 0);

    const rule = rulePick(item.query, candidates, synByIndex);
    const ruleOk = rule.pick?.fdc_id === correct.fdc_id;
    if (ruleOk) tally.ruleOk++;
    else if (rule.ambiguous.length) tally.ruleAmbiguous++;
    else if (rule.pick) tally.ruleWrong++;
    else tally.ruleNone++;

    let localPick = null;
    let cloudPick = null;
    try {
        localPick = await pick(localModel, item.query, candidates, synByIndex, true);
    } catch {
        localPick = null;
    }
    try {
        cloudPick = await pick(cloudModel, item.query, candidates, synByIndex, true);
    } catch {
        cloudPick = null;
    }
    if (localPick?.fdc_id === correct.fdc_id) tally.localOk++;
    if (cloudPick?.fdc_id === correct.fdc_id) tally.cloudOk++;

    const mark = (ok) => (ok ? 'OK ' : 'x  ');
    rows.push(
        `${mark(ruleOk)}${mark(localPick?.fdc_id === correct.fdc_id)}${mark(cloudPick?.fdc_id === correct.fdc_id)} ` +
        `${item.query.padEnd(16)} want ${correct.description.slice(0, 30)}\n` +
        `        rule:  ${rule.pick?.description?.slice(0, 56) ?? `-- ${rule.why}`}\n` +
        `        local: ${localPick?.description?.slice(0, 56) ?? '(error)'}\n` +
        `        cloud: ${cloudPick?.description?.slice(0, 56) ?? '(error)'}\n` +
        `        syns:  ${(synByIndex.get(correct.fdc_id) ?? []).join(' / ') || '(none)'}`,
    );
}

const n = tally.scored || 1;
const avgTerms = tally.termCounts.reduce((a, b) => a + b, 0) / Math.max(tally.termCounts.length, 1);

console.log(rows.join('\n'));
console.log(
    `\n${'='.repeat(66)}\n` +
    `scored ${tally.scored}, skipped ${tally.skipped}\n\n` +
    `PATH A  rule only (no LLM) : ${tally.ruleOk}/${n} correct` +
    `   (${tally.ruleAmbiguous} ambiguous, ${tally.ruleWrong} wrong, ${tally.ruleNone} no match)\n` +
    `PATH B  local ${localModel.padEnd(14)}: ${tally.localOk}/${n}\n` +
    `PATH C  cloud ${cloudModel.padEnd(14)}: ${tally.cloudOk}/${n}\n\n` +
    `avg synonyms per correct food: ${avgTerms.toFixed(1)}`,
);
