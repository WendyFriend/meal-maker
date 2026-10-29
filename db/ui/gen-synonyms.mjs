// Generates ingredient search synonyms for every core food, via Ollama.
//
// Guards, all of which came from measured failures earlier in this project:
//
//  * think:false at the TOP LEVEL. Nested inside options it is silently
//    ignored, and reasoning models then spend the whole token budget thinking
//    and return empty content. That bug produced several "0/12" runs.
//  * num_predict >= 200. A one-digit answer is cheap; a synonym array is not,
//    and a tight budget truncates mid-array.
//  * Robust array extraction. Some models emit prose plus a stray ']'; a
//    greedy /\[.*\]/ regex silently yields zero terms.
//  * Fail loudly. A response with no array is recorded as 'failed', never as
//    'empty', so a model change cannot silently wipe out the synonym table.
//  * Term filters: reject nutrition/SEO phrasing, vague categories, and
//    anything longer than 4 words.
//  * Qualifier preservation: a canned/dried/frozen food must not claim a term
//    that drops that qualifier, or it competes with the raw food.
//  * Bare-noun ownership: only foods with no process qualifier may claim a bare
//    noun, and only one food may hold a given bare noun (enforced by a unique
//    index in the database).
//
// Usage:
//   node --env-file=.env db/ui/gen-synonyms.mjs --dry-run --limit 20
//   node --env-file=.env db/ui/gen-synonyms.mjs --limit 200
//   node --env-file=.env db/ui/gen-synonyms.mjs            (all core foods)
import { execFile } from 'node:child_process';

const OLLAMA = 'http://localhost:11434';

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);
const arg = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dryRun = has('dry-run');
const limit = arg('limit', '0') === '0' ? null : Number(arg('limit'));
const model = arg('model', 'gemma4:cloud');
const scope = arg('scope', 'core');
// Concurrency 8 measured as the throughput peak against ollama.com:
//    1 -> 1.95 req/s    4 -> 6.05    8 -> 6.31    12 -> 5.96    16 -> 4.09
// Past 8 the account's server-side concurrency limit causes queueing, so more
// workers makes it slower, not faster.
const concurrency = Number(arg('concurrency', '8'));
// Measured: batch 20 is 4.3x faster than per-food requests and uses fewer
// tokens per food (18 in / 12 out vs 74 / 24), because the system prompt is
// amortised instead of repeated.
const batchSize = Number(arg('batch', '20'));
const PSQL = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

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
                maxBuffer: 128 * 1024 * 1024,
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

const sqlLit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// --- prompt -------------------------------------------------------------
// No target count: forcing "6 to 8" makes the model pad weak terms for foods
// that only have two real names.
const SYSTEM =
    'You generate ingredient search terms for a recipe app.\n' +
    'A user types these into a search box to find this food.\n' +
    'Give the real names people use - include regional and colloquial names ' +
    '(British, American, Australian, Indian) when they exist.\n' +
    'Give ONLY names that are genuinely used. If the food has two common ' +
    'names, give two. Never pad the list with invented or descriptive phrases.\n' +
    'If the food is canned, dried, frozen, powdered, juiced or condensed, ' +
    'every term must keep that qualifier - never the bare word alone.\n' +
    'Never include words like calories, nutrition, recipe, how many, vs.\n' +
    'Reply with ONLY a JSON array of lowercase strings.';

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
                    const c = JSON.parse(cleaned.slice(start, i + 1));
                    return Array.isArray(c) ? c : [];
                } catch {
                    return [];
                }
            }
        }
    }
    return [];
}

async function generate(description) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '30m',
            think: false,
            options: { temperature: 0.2, num_predict: 260, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `USDA food description: ${description}\n\nNames:` },
            ],
        }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const content = (data.message?.content ?? '').trim();
    const thinking = (data.message?.thinking ?? '').length;

    if (!content && thinking > 0) throw new Error(`empty content, ${thinking} chars thinking`);
    if (!content) throw new Error('empty content');

    const terms = firstJsonArray(content);
    // Distinguish "model returned nothing parseable" from "model returned an
    // empty list". The first is a failure worth surfacing, not a success.
    if (!terms.length && !/\[\s*\]/.test(content)) {
        throw new Error(`no JSON array in response: ${content.slice(0, 80)}`);
    }
    return terms;
}

// --- filters ------------------------------------------------------------
const BANNED_PHRASE = /\b(calorie|calories|nutrition|nutritional|recipe|how many|what is|versus|vs\.?)\b/i;
const VAGUE = /^(vegetable|fruit|food|meat|veggie|veggies|plant|thing|ingredient|produce|protein|grain)s?$/i;

// Qualifiers that must survive into any generated term.
//
// Only the ones that change WHICH FOOD this is, not merely how it was cooked.
// The first version also enforced cooked/sweetened, which rejected good terms:
//   'bacon' dropped because the description said 'cooked'
//   'turkey wing' dropped because the description said 'smoked, cooked'
// A cook typing "bacon" means bacon; requiring "cooked bacon" every time is
// noise. But a canned food claiming the bare word would compete with the fresh
// one, so canned/dried/frozen/powdered stay mandatory.
const QUALIFIERS = [
    ['canned', /\bcanned|\btinned/i],
    ['dried', /\bdried|\bdehydrated|\bsun-dried/i],
    ['frozen', /\bfrozen/i],
    ['powdered', /\bpowder\b/i],
];

/**
 * Collects which qualifier terms the description itself offers.
 *
 * Some USDA descriptions name several alternative forms:
 *   'Bananas, dehydrated, or banana powder'
 *   'Nuts, coconut meat, dried (desiccated), sweetened, flaked, canned'
 *
 * Requiring every qualifier in every term rejected all of their valid terms -
 * "banana powder" failed the 'dried' check and "dehydrated bananas" failed the
 * 'powdered' check, leaving the food with no terms at all. A term is acceptable
 * if it satisfies at least ONE named form.
 */
function allowedQualifierSets(description) {
    return QUALIFIERS.map(([label, re]) => ({
        label,
        present: re.test(description),
        pattern: re,
    })).filter((q) => q.present);
}

function cleanTerms(raw, description) {
    const kept = [];
    const rejected = [];
    const required = allowedQualifierSets(description);

    for (const term of raw) {
        if (typeof term !== 'string') {
            rejected.push({ term: String(term), reason: 'not a string' });
            continue;
        }
        const t = term.trim().toLowerCase().replace(/\s+/g, ' ');

        // 1. Invented qualifier: "frozen" appearing on a refrigerated product
        //    makes the term compete with a different food.
        const invented = QUALIFIERS.find(([, re]) => re.test(t) && !re.test(description));

        // 2. Dropped qualifier. A term passes if it carries ANY of the
        //    description's qualifiers, not all of them - otherwise a food with
        //    two alternative forms has no acceptable term at all.
        const drops = required.length > 0 && !required.some((q) => q.pattern.test(t));

        if (t.length < 3) rejected.push({ term: t, reason: 'too short' });
        else if (invented) rejected.push({ term: t, reason: `invents qualifier "${invented[0]}"` });
        else if (drops) {
            rejected.push({
                term: t,
                reason: `drops qualifier "${required.map((q) => q.label).join('/')}"`,
            });
        } else if (BANNED_PHRASE.test(t)) rejected.push({ term: t, reason: 'seo phrasing' });
        else if (VAGUE.test(t)) rejected.push({ term: t, reason: 'vague category' });
        // Long but qualifier-correct beats short and wrong: an 8-word term that
        // says the right thing is more useful than nothing.
        else if (t.split(/\s+/).length > 8) rejected.push({ term: t, reason: 'too many words' });
        else if (t.length > 48) rejected.push({ term: t, reason: 'too long' });
        else if (kept.includes(t)) {
            rejected.push({ term: t, reason: 'duplicate' });
        } else {
            kept.push(t);
        }
    }
    return { kept, rejected };
}

/**
 * Decides whether a food may claim its bare noun.
 *
 * The trap here, found in the first dry run: the head of a comma-separated
 * USDA description is the GENUS, not the specific food. So
 *
 *   'Milk, buttermilk, fluid, cultured'      head = 'Milk'      -> WRONG, it is buttermilk
 *   'Potatoes, hash brown, refrigerated'     head = 'Potatoes'  -> WRONG, it is hash browns
 *   'Salad dressing, blue cheese, light'     head = 'Salad dressing' -> collides with 3 others
 *
 * Handing the genus out as a bare noun would make a cook typing "milk" get
 * buttermilk - exactly the failure this whole pass is meant to prevent.
 *
 * So a bare noun is only assigned when the description is essentially just the
 * food itself: either a single part, or a head plus a pure state word
 * ('Onions, raw'). Anything with a distinguishing second part gets no bare
 * noun at all. Terms are still generated; only the exclusive claim is withheld.
 */
// Only words that leave the food essentially unchanged. Deliberately excludes
// cooked/boiled/baked/fried: "taro" means raw taro, so 'Taro, cooked, without
// salt' must not claim it. Salt and preparation-form words are fine because
// they don't make it a different food.
const STATE_WORDS = new Set([
    'raw',
    'fresh',
    'unprepared',
    'uncooked',
    'dry',
    'plain',
    'unflavored',
    'unsalted',
    'without salt',
    'with salt',
    'salt added',
    'unsweetened',
    'without salt added',
]);

function bareNounFor(description) {
    if (QUALIFIERS.some(([, re]) => re.test(description))) return null;

    const parts = description
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);

    // Every part after the head must be a bare state word, otherwise the
    // second part is naming a different food.
    const extras = parts.slice(1);
    if (extras.some((part) => !STATE_WORDS.has(part))) return null;

    const head = parts[0];
    if (head.split(/\s+/).length > 2) return null;
    if (BANNED_PHRASE.test(head) || VAGUE.test(head)) return null;

    return head;
}

/**
 * Procedural fallback: derive terms from the USDA description itself.
 *
 * The LLM is good at regional names (courgette, aubergine, chana) but poor at
 * preserving qualifiers - it kept dropping "canned" from canned apricots,
 * which made every term rejectable. The description already contains the
 * qualifiers, so it can generate correct-if-plain terms with no model at all.
 *
 * Kept deliberately conservative: it produces the head noun plus the
 * significant qualifiers, in the orders people actually type.
 */
function proceduralTerms(description) {
    const parts = description
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
    if (!parts.length) return [];

    // Words that carry no search value.
    const NOISE = new Set([
        'nfs',
        'ns as to form',
        'unprepared',
        'prepared',
        'unflavored',
        'unspecified type',
        'all commercial varieties',
        'includes foods for usda\'s food distribution program',
        'with added vitamin a and vitamin d',
        'with added vitamin d',
        'with salt added',
        'without salt added',
        'salt not added in processing',
    ]);

    const head = parts[0];
    const qualifiers = parts
        .slice(1)
        // USDA writes alternatives inline: "canned or bottled" produced the
        // 6-word term "canned or bottled apple juice", which failed the length
        // filter and left the food with no usable terms. Take the first
        // alternative instead.
        .flatMap((p) => p.split(/\s+or\s+/))
        .map((p) => p.trim())
        .filter((p) => !NOISE.has(p))
        .filter((p) => p.split(/\s+/).length <= 3);

    const terms = new Set();

    // "canned apricots", "frozen peas"
    for (const qualifier of qualifiers) {
        terms.add(`${qualifier} ${head}`);
    }
    // "apricots canned" as well - some people type it that way
    if (qualifiers.length) terms.add(`${head} ${qualifiers[0]}`);
    // head alone only when there is nothing qualifying it
    if (!qualifiers.length) terms.add(head);
    // head plus the single most distinguishing qualifier
    if (qualifiers.length > 1) terms.add(`${head}, ${qualifiers[0]}`);

    return [...terms]
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter((t) => t.length >= 3 && t.length <= 32)
        .filter((t) => t.split(/\s+/).length <= 4);
}

// --- nemotron fallback ---------------------------------------------------
// Used only when both the model and the procedural path produce nothing. Kept
// separate from the synonym model because its job is different: read the
// description and state the single most likely thing a cook would type.
async function askNemotron(description) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'nemotron-3-super:cloud',
            stream: false,
            keep_alive: '30m',
            think: false,
            options: { temperature: 0, num_predict: 60, num_ctx: 2048 },
            messages: [
                {
                    role: 'system',
                    content:
                        'Name the ONE search term a cook would type to find this exact food.\n' +
                        'If the food is canned, dried, frozen or powdered, the term must ' +
                        'say so.\n' +
                        'Reply with the term only, lowercase, no punctuation.',
                },
                { role: 'user', content: `USDA food description: ${description}` },
            ],
        }),
    });
    if (!response.ok) throw new Error(`nemotron HTTP ${response.status}`);
    const data = await response.json();
    const content = (data.message?.content ?? '').trim().toLowerCase();
    if (!content) throw new Error('nemotron returned nothing');
    return [content.replace(/^["'\s]+|["'\s]+$/g, '')];
}

/**
 * Batched generation: several foods in ONE request.
 *
 * Measured against per-food requests at concurrency 8:
 *
 *   batch  1 -> 11.7s for 40 foods, 83% ok, 74 in / 24 out tokens per food
 *   batch  8 ->  4.2s,               100% ok, 24 in / 14 out
 *   batch 20 ->  2.7s,               100% ok, 18 in / 12 out
 *
 * Batching wins on both axes because the ~100-token system prompt stops being
 * repeated, and the model emits one compact JSON object rather than re-emitting
 * structure per food.
 *
 * The risk is concentration: one malformed reply loses the whole batch. Handled
 * by splitting recursively below.
 */
const BATCH_SYSTEM =
    'You generate ingredient search terms for a recipe app.\n' +
    'You receive a JSON object mapping an id to a USDA food description.\n' +
    'For each id, return the real names people use, including regional and ' +
    'colloquial names (British, American, Australian, Indian) when they exist.\n' +
    'Give ONLY names that are genuinely used. If a food has two common names, ' +
    'give two. Never pad with invented or descriptive phrases.\n' +
    'If a food is canned, dried, frozen, powdered, juiced or condensed, every ' +
    'term must keep that qualifier.\n' +
    'Never include words like calories, nutrition, recipe, how many, vs.\n' +
    'Reply with ONLY a JSON object mapping each id to an array of lowercase strings.';

/** Extracts the first balanced JSON object from text, tolerating prose/fences. */
function firstJsonObject(text) {
    const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();

    const start = cleaned.indexOf('{');
    if (start < 0) return null;

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
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(cleaned.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

/**
 * Requests terms for a group of foods. Returns a Map of fdc_id -> terms.
 *
 * Foods missing from a successful response are simply absent from the map, so
 * the caller can decide to retry them individually rather than guessing.
 */
async function generateBatch(group) {
    const payload = {};
    for (const food of group) payload[String(food.fdc_id)] = food.description;

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '30m',
            think: false,
            options: {
                temperature: 0.2,
                // Output scales with group size; the budget must too or the
                // JSON truncates mid-object and the whole batch is lost.
                num_predict: 200 + group.length * 100,
                num_ctx: 4096,
            },
            messages: [
                { role: 'system', content: BATCH_SYSTEM },
                { role: 'user', content: `Foods:\n${JSON.stringify(payload, null, 1)}` },
            ],
        }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const content = (data.message?.content ?? '').trim();

    if (!content) {
        throw new Error(
            (data.message?.thinking ?? '').length
                ? 'empty content, thinking only'
                : 'empty content',
        );
    }

    const parsed = firstJsonObject(content);
    if (!parsed) throw new Error(`no JSON object in response: ${content.slice(0, 60)}`);

    const out = new Map();
    for (const food of group) {
        const value = parsed[String(food.fdc_id)];
        if (Array.isArray(value)) out.set(food.fdc_id, value);
    }
    return out;
}

/**
 * Batched generation with recursive split on failure.
 *
 * A malformed or refused response loses only its own group: the group is halved
 * and retried, down to single foods. That keeps batch-20 throughput while
 * degrading to exactly the behaviour of unbatched calls in the worst case.
 */
async function generateBatched(group, depth = 0) {
    try {
        const got = await generateBatch(group);
        const missing = group.filter((f) => !got.has(f.fdc_id));

        // Partial success: retry only the missing foods, split in half.
        if (missing.length && missing.length < group.length) {
            const retried = await generateBatched(missing, depth + 1);
            for (const [id, terms] of retried) got.set(id, terms);
        }
        return got;
    } catch (error) {
        if (group.length === 1) {
            // A single food genuinely failed; the caller falls back to
            // procedural terms.
            throw error;
        }
        const mid = Math.ceil(group.length / 2);
        const left = await generateBatched(group.slice(0, mid), depth + 1);
        const right = await generateBatched(group.slice(mid), depth + 1);
        return new Map([...left, ...right]);
    }
}

// --- run ----------------------------------------------------------------
let foods = await query(`
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.fdc_id), '[]') FROM (
        SELECT f.fdc_id, f.description
        FROM food f
        WHERE f.scope = ${sqlLit(scope)}
          AND NOT EXISTS (
              SELECT 1 FROM synonym_job j
              WHERE j.fdc_id = f.fdc_id AND j.status IN ('done', 'empty')
          )
        ORDER BY f.fdc_id
    ) t;
`);

if (limit) foods = foods.slice(0, limit);

console.log(
    `${dryRun ? 'DRY RUN ' : ''}model ${model} | scope ${scope} | ${foods.length} foods | ` +
        `batch ${batchSize} x ${concurrency} concurrent\n`,
);

if (!foods.length) {
    console.log('nothing to do (all foods already processed)');
    process.exit(0);
}

let done = 0;
let failed = 0;
let empty = 0;
let termsTotal = 0;
let bareNouns = 0;
let usedProcedural = 0;
let usedNemotron = 0;
const failures = [];
const startedAll = Date.now();

/**
 * Resolves one food to its final term list, without touching the database.
 *
 * `prefetched` holds terms already returned by a batched request, so no
 * additional model call is made for them.
 */
async function resolveTerms(food, prefetched) {
    let rejected = [];
    let kept = [];
    let source = 'batch';

    if (prefetched) {
        const cleaned = cleanTerms(prefetched, food.description);
        kept = cleaned.kept;
        rejected = cleaned.rejected;
    } else {
        // Not returned by the batch: retry this food alone, which is also the
        // graceful-degradation path when a batch reply was malformed.
        try {
            const raw = await generate(food.description);
            const cleaned = cleanTerms(raw, food.description);
            kept = cleaned.kept;
            rejected = cleaned.rejected;
            source = 'single';
        } catch (error) {
            rejected.push({
                term: '',
                reason: `model error: ${String(error.message ?? error).slice(0, 80)}`,
            });
            source = 'model-failed';
        }
    }

    // Procedural fallback: never invents a term and never drops a qualifier,
    // because both come straight from the description.
    if (!kept.length) {
        const fallback = cleanTerms(proceduralTerms(food.description), food.description);
        if (fallback.kept.length) {
            kept = fallback.kept;
            source = 'procedural';
        }
    }

    // Last resort: one term from the cheap picker model.
    if (!kept.length && useNemotron) {
        try {
            const asked = await askNemotron(food.description);
            const filtered = cleanTerms(asked, food.description);
            if (filtered.kept.length) {
                kept = filtered.kept;
                source = 'nemotron';
            }
        } catch {
            /* fall through to recording the food as empty */
        }
    }

    return { food, kept, rejected, bare: bareNounFor(food.description), source };
}

/**
 * Writes a whole chunk in ONE psql invocation.
 *
 * Previously each food spawned its own psql process, which was ~20% of total
 * runtime for no benefit. This builds a single statement covering every result
 * in the chunk.
 */
async function writeChunk(results) {
    const synonymValues = [];
    const jobValues = [];
    const rejectValues = [];

    for (const r of results) {
        const bare = r.bare;
        if (r.kept.length) {
            for (const term of r.kept) {
                synonymValues.push(
                    `(${r.food.fdc_id}, ${sqlLit(term)}, 'generated', ${term === bare ? 'true' : 'false'})`,
                );
            }
            jobValues.push(
                `(${r.food.fdc_id}, 'done', ${r.kept.length}, ${sqlLit(model)}, NULL)`,
            );
        } else {
            jobValues.push(
                `(${r.food.fdc_id}, 'empty', 0, ${sqlLit(model)}, ${sqlLit(
                    JSON.stringify(r.rejected).slice(0, 500),
                )})`,
            );
        }

        for (const rej of r.rejected) {
            rejectValues.push(
                `(${r.food.fdc_id}, ${sqlLit(r.food.description)}, ${sqlLit(rej.term ?? '')}, ${sqlLit(rej.reason)})`,
            );
        }
    }

    const parts = [];

    if (synonymValues.length) {
        parts.push(`
            INSERT INTO food_synonym (fdc_id, term, origin, is_bare_noun)
            VALUES ${synonymValues.join(',')}
            ON CONFLICT (fdc_id, term) DO NOTHING;
        `);
    }

    if (rejectValues.length) {
        parts.push(`
            INSERT INTO synonym_reject (fdc_id, description, term, reason)
            VALUES ${rejectValues.join(',')};
        `);
    }

    if (jobValues.length) {
        parts.push(`
            INSERT INTO synonym_job (fdc_id, status, terms_added, model, error)
            VALUES ${jobValues.join(',')}
            ON CONFLICT (fdc_id) DO UPDATE SET
                status = EXCLUDED.status,
                terms_added = EXCLUDED.terms_added,
                model = EXCLUDED.model,
                error = EXCLUDED.error,
                attempted_at = now();
        `);
    }

    if (!parts.length) return;
    // One transaction per chunk: a partial chunk must not leave foods marked
    // done with no terms, which would silently skip them on the next run.
    await query(`BEGIN; ${parts.join('\n')} COMMIT;`);
}

const useNemotron = has('nemotron-fallback');

// Process in chunks of `concurrency` batches. Each chunk sends whole batches of
// foods in one request, then writes the whole chunk in one psql call.
for (let start = 0; start < foods.length; start += concurrency * batchSize) {
    const slice = foods.slice(start, start + concurrency * batchSize);

    // Split into batches and fire them all at once.
    const groups = [];
    for (let i = 0; i < slice.length; i += batchSize) {
        groups.push(slice.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
        groups.map(async (group) => {
            try {
                return await generateBatched(group);
            } catch {
                return new Map();
            }
        }),
    );

    // Flatten: one entry per food, with any prefetched terms.
    const prefetched = new Map();
    for (const map of batchResults) {
        for (const [id, terms] of map) prefetched.set(id, terms);
    }

    const resolved = await Promise.all(
        slice.map(async (food) => {
            try {
                return await resolveTerms(food, prefetched.get(food.fdc_id));
            } catch (error) {
                return {
                    food,
                    kept: [],
                    rejected: [{ term: '', reason: `unexpected: ${String(error.message).slice(0, 100)}` }],
                    bare: null,
                    source: 'error',
                };
            }
        }),
    );

    resolved.forEach((r, i) => {
        const label = `[${start + i + 1}/${foods.length}]`;

        if (r.kept.length) {
            done++;
            termsTotal += r.kept.length;
            if (r.source === 'nemotron') usedNemotron++;
            if (r.source === 'procedural') usedProcedural++;
            if (dryRun) {
                console.log(
                    `${label} ${r.food.description.slice(0, 52)}` +
                        `${r.source !== 'batch' ? ` (${r.source})` : ''}\n` +
                        `        keep: ${r.kept.join(' / ')}` +
                        `${r.bare ? `\n        bare: "${r.bare}"` : ''}` +
                        `${r.rejected.length ? `\n        drop: ${r.rejected.map((x) => `${x.term} (${x.reason})`).join(', ')}` : ''}`,
                );
            }
        } else {
            empty++;
            if (dryRun) console.log(`${label} EMPTY  ${r.food.description}`);
        }

        if (r.source === 'error' || r.source === 'model-failed') {
            failed++;
            failures.push(`${r.food.description}: ${r.rejected[0]?.reason ?? r.source}`);
        }
    });

    if (!dryRun) {
        try {
            await writeChunk(resolved);
            bareNouns += resolved.filter((r) => r.bare && r.kept.includes(r.bare)).length;
        } catch (error) {
            const message = String(error.message ?? error);
            if (/food_synonym_bare_noun_uniq/.test(message)) {
                // Retry one at a time; only the colliding food fails.
                for (const r of resolved) {
                    try {
                        await writeChunk([r]);
                        if (r.bare && r.kept.includes(r.bare)) bareNouns++;
                    } catch (inner) {
                        const innerMessage = String(inner.message ?? inner);
                        if (/food_synonym_bare_noun_uniq/.test(innerMessage)) {
                            // Drop the bare-noun claim and retry: the term is
                            // still useful, it simply cannot be exclusive.
                            r.kept = r.kept.filter((t) => t !== r.bare);
                            r.bare = null;
                            try {
                                await writeChunk([r]);
                            } catch {
                                failed++;
                                failures.push(`${r.food.description}: ${innerMessage.slice(0, 120)}`);
                            }
                        } else {
                            failed++;
                            failures.push(`${r.food.description}: ${innerMessage.slice(0, 120)}`);
                        }
                    }
                }
            } else {
                failed += resolved.length;
                failures.push(`chunk write failed: ${message.slice(0, 150)}`);
                console.error(`chunk write FAILED: ${message.slice(0, 200)}`);
            }
        }
    }
}

const elapsed = Math.round((Date.now() - startedAll) / 1000);
const rate = (done + empty) / Math.max(elapsed, 1);
console.log(
    `\n${'='.repeat(60)}\n` +
        `${dryRun ? 'DRY RUN complete' : 'RUN complete'} in ${elapsed}s (${rate.toFixed(2)}/s)\n` +
        `  generated : ${done}\n` +
        `  empty     : ${empty}\n` +
        `  failed    : ${failed}\n` +
        `  terms     : ${termsTotal} (avg ${(termsTotal / Math.max(done, 1)).toFixed(1)} per food)\n` +
        `  bare nouns: ${bareNouns}\n` +
        `  procedural: ${usedProcedural}   nemotron: ${usedNemotron}`,
);

if (failures.length) {
    console.log(`\nfirst failures:\n  ${failures.slice(0, 8).join('\n  ')}`);
}
