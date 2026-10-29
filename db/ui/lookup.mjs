// Food lookup tool — search a name, get nutrition. Nothing else.
//
// Flow, matching the brief:
//   1. user types or speaks; after 1s of silence the client asks for a lookup
//   2. the database tries rules first (exact synonym, description prefix)
//   3. only if the result is not confident does the server ask nemotron to pick
//      from the top candidates
//   4. one card is rendered: the chosen food's nutrition. A new utterance or
//      edit replaces it - there is no history and no candidate list.
//
// Serves on 3443 over HTTPS, plus 3010/http bound to localhost only.
//
// HTTPS is not a preference: getUserMedia does not exist outside a secure
// context, so over plain http the mic button is dead on a phone (localhost is
// exempt, which is why it worked on this machine and not on the phone). The
// certificate is self-signed, so the phone warns once; /ca.pem is served so the
// certificate can be installed and the warning goes away for good.
//
// Windows Firewall already allows node.exe on all ports for the Private
// profile, so no extra rule is needed for the phone to reach 3443.
//
// Usage: node --env-file=.env db/ui/lookup.mjs
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

// Port 3443 for TLS, 3010 for plain http. Both are only defaults.
const PORT = Number(process.env.LOOKUP_PORT) || 0;
const OLLAMA = 'http://localhost:11434';
const PICKER_MODEL = process.env.LOOKUP_MODEL || 'nemotron-3-super:cloud';
const PSQL = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
// gpt-transcribe is the current recommended model. whisper-1 and the
// gpt-4o-*transcribe family are deprecated and shut down 26 Feb 2027, so they
// are deliberately not used.
const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'gpt-transcribe';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const dbUrl = process.env.NUTRITION_DATABASE_URL;
// Only fatal when this file is run as a program. Importing it (for the unit
// tests) must not exit the process.
const isMain = process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url);
if (!dbUrl && isMain) {
    console.error('NUTRITION_DATABASE_URL is not set.');
    process.exit(1);
}
const parsed = dbUrl ? new URL(dbUrl) : null;

const here = dirname(fileURLToPath(import.meta.url));

/** Runs SQL via psql, passing values as :'vars' over stdin. */
function query(sql, vars = {}) {
    const args = [
        '-h', parsed.hostname,
        '-p', parsed.port || '5432',
        '-U', decodeURIComponent(parsed.username),
        '-d', parsed.pathname.replace(/^\//, ''),
        '-t', '-A', '-q', '-v', 'ON_ERROR_STOP=1',
    ];
    for (const [key, value] of Object.entries(vars)) args.push('-v', `${key}=${value}`);
    args.push('-f', '-');

    return new Promise((resolve, reject) => {
        const child = execFile(
            PSQL,
            args,
            {
                maxBuffer: 32 * 1024 * 1024,
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

/**
 * Asks nemotron to choose among candidates.
 *
 * Only called when the database could not resolve the query confidently. The
 * model sees the descriptions plus their synonyms, and must answer with a
 * number; anything unparseable is treated as no decision so the caller can fall
 * back to the best-ranked candidate rather than guessing.
 */
async function askPicker(term, candidates) {
    const list = candidates
        .map((c, i) => `${i + 1}. ${c.description}${c.matched_via.startsWith('synonym') ? '' : ''}`)
        .join('\n');

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: PICKER_MODEL,
            stream: false,
            keep_alive: '15m',
            // Top-level: nested in options it is ignored, and reasoning models
            // then spend the whole budget thinking and return no answer.
            think: false,
            options: { temperature: 0, num_predict: 80, num_ctx: 2048 },
            messages: [
                {
                    role: 'system',
                    content:
                        'A cook typed an ingredient name. Choose the ONE numbered ' +
                        'option that best matches what they meant.\n' +
                        'Prefer plain, raw, unprocessed, everyday foods. Reject ' +
                        'canned, dried, frozen, powdered, cooked, restaurant or ' +
                        'babyfood versions unless the cook asked for them.\n' +
                        'Reply with ONLY the number.',
                },
                { role: 'user', content: `Ingredient: ${term}\n\n${list}\n\nNumber:` },
            ],
        }),
    });

    if (!response.ok) throw new Error(`picker HTTP ${response.status}`);
    const data = await response.json();
    const content = (data.message?.content ?? '').trim();
    const match = content.match(/\d+/);
    if (!match) return null;
    const index = Number(match[0]) - 1;
    return candidates[index] ?? null;
}

// Canonical names for the nutrients a cook might state as a goal. Aliases map
// onto one spelling so the UI never has to guess between "carb" and
// "carbohydrates".
const CANONICAL_NUTRIENT = {
    calories: 'calories',
    calorie: 'calories',
    kcal: 'calories',
    cal: 'calories',
    energy: 'calories',
    protein: 'protein',
    fat: 'fat',
    fats: 'fat',
    carb: 'carbs',
    carbs: 'carbs',
    carbohydrate: 'carbs',
    carbohydrates: 'carbs',
    fibre: 'fibre',
    fiber: 'fibre',
    sugar: 'sugar',
    sugars: 'sugar',
    sodium: 'sodium',
    cholesterol: 'cholesterol',
};

// Units the card knows how to render. "cal" is folded into kcal because in a
// food context nobody means the small calorie.
const CANONICAL_UNIT = {
    kcal: 'kcal',
    cal: 'kcal',
    calories: 'kcal',
    calorie: 'kcal',
    g: 'g',
    gram: 'g',
    grams: 'g',
    mg: 'mg',
    '%': '%',
};

// Upper bound per nutrient, in the unit that nutrient is normally quoted in.
// A spoken "500" can arrive as 50000 from a bad transcription, and showing that
// would look like a broken app rather than a mishearing.
const TARGET_CEILING = {
    calories: 20000,
    protein: 1000,
    carbs: 1000,
    fat: 1000,
    fibre: 500,
    sugar: 1000,
    sodium: 20000,
    cholesterol: 20000,
};

/**
 * Normalises the `targets` array from a model reply.
 *
 * The model is asked for {"nutrient","amount","unit"} objects, but it can still
 * emit a stray name, a string amount or a negative number. Everything unusable
 * is dropped rather than coerced, because a shown target that is quietly wrong
 * is worse than one that is missing.
 */
export function parseTargets(raw) {
    if (!Array.isArray(raw)) return [];

    const targets = [];
    const seen = new Set();

    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;

        const nutrient = CANONICAL_NUTRIENT[String(entry.nutrient ?? '').toLowerCase().trim()];
        if (!nutrient) continue;

        // Number(...) accepts "", " " and booleans, so require a real number or
        // a numeric string and reject everything else.
        const amount =
            typeof entry.amount === 'number'
                ? entry.amount
                : typeof entry.amount === 'string' && entry.amount.trim() !== ''
                  ? Number(entry.amount)
                  : NaN;
        if (!Number.isFinite(amount) || amount <= 0) continue;

        // Default the unit per nutrient: calories are kcal, everything else is
        // grams except the two minerals that are quoted in mg.
        const fallback =
            nutrient === 'calories' ? 'kcal' : nutrient === 'sodium' || nutrient === 'cholesterol' ? 'mg' : 'g';
        const unit = CANONICAL_UNIT[String(entry.unit ?? '').toLowerCase().trim()] ?? fallback;

        // A percentage can never exceed 100; anything else is measured against
        // the per-nutrient ceiling.
        const ceiling = unit === '%' ? 100 : (TARGET_CEILING[nutrient] ?? 100000);
        if (amount > ceiling) continue;

        // One target per nutrient: saying "30g protein and 30% protein" should
        // not stack two chips that contradict each other.
        const key = `${nutrient}:${unit}`;
        if (seen.has(key)) continue;
        seen.add(key);

        targets.push({ nutrient, amount, unit });
    }

    return targets;
}

/**
 * Extracts the food items from a model reply.
 *
 * Separated from the HTTP call so the parsing rules — which are where the bugs
 * live — can be tested without a model. Models wrap JSON in prose or fences
 * often enough that locating the object is more reliable than parsing the whole
 * reply, and a reply that still cannot be read returns null so the caller keeps
 * whatever the rules found.
 */
export function parseAnalysis(content) {
    const text = String(content ?? '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    let parsed;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        return null;
    }

    const raw = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = [];
    for (const entry of raw) {
        if (typeof entry !== 'string') continue;
        // Defensive: a model may echo punctuation or a whole sentence despite
        // the instruction. Re-clean so downstream lookups get a bare name.
        const clean = entry
            .replace(/\s+/g, ' ')
            .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
            .toLowerCase()
            .trim();
        if (clean && clean.length >= 2 && !items.includes(clean)) items.push(clean);
        // Eight is well past any real utterance and keeps the fan-out bounded.
        if (items.length >= 8) break;
    }

    // Targets are optional and must not veto an otherwise readable reply, but a
    // reply with no food items has nothing to look up, so it is still a null.
    const targets = parseTargets(parsed?.targets);

    if (!items.length) return null;
    return { items, targets };
}

/**
 * Parses a spoken request into one or more food items.
 *
 * Only called when the database found nothing worth trusting, because it costs
 * a model round-trip. It does two jobs at once, which is why it is a single
 * call rather than two: split a list into separate ingredients, and repair an
 * obvious misspelling. Saying "I want tomatoes, potatoes, egg and tofu" used to
 * return no match at all, because the whole sentence was treated as one name.
 *
 * Returns null when the model gives nothing usable, so the caller can fall back
 * to whatever the rules found rather than inventing an answer.
 */
async function analyzeQuery(text) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: PICKER_MODEL,
            stream: false,
            keep_alive: '15m',
            // Top-level. Nested inside options it is ignored, and the reasoning
            // models then spend the entire budget thinking and return nothing.
            think: false,
            options: { temperature: 0, num_predict: 220, num_ctx: 2048 },
            messages: [
                {
                    role: 'system',
                    content:
                        'You parse a cook\'s spoken request for ingredients.\n' +
                        'Do THREE things:\n' +
                        '1. If it names several different foods, split it into one ' +
                        'item per food. Drop filler words like "I want", "some", ' +
                        '"please", "and", "a few".\n' +
                        '2. If an item is clearly misspelled, correct it to the ' +
                        'standard food name. If you are not sure, leave it exactly ' +
                        'as written.\n' +
                        '3. If the speaker states a nutrition figure for the food, ' +
                        'record it. This includes "30% protein", "30g protein", ' +
                        '"500 calories", "20 grams of carbs". A percentage is a ' +
                        'share of that food\'s energy: use unit "%" for it, "kcal" ' +
                        'for calories, "g" or "mg" otherwise. Record ONLY figures ' +
                        'the speaker actually said, and never invent one.\n' +
                        'Each item must be a plain food name, in lowercase, with no ' +
                        'quantities, verbs or punctuation. Never invent a food that ' +
                        'was not mentioned, and never repeat an item.\n' +
                        'Reply with ONLY minified JSON:\n' +
                        '{"items":["..."],"targets":[{"nutrient":"protein","amount":30,"unit":"g"}]}\n' +
                        'Valid nutrient names: calories, protein, carbs, fat, fibre, ' +
                        'sugar, sodium, cholesterol. Use targets: [] when nothing ' +
                        'was stated.\n' +
                        'Examples:\n' +
                        '  "I want tomatoes, potatoes, egg and tofu" -> ' +
                        '{"items":["tomatoes","potatoes","egg","tofu"],"targets":[]}\n' +
                        '  "some brocolli please" -> {"items":["broccoli"],"targets":[]}\n' +
                        '  "chiken breast" -> {"items":["chicken breast"],"targets":[]}\n' +
                        '  "courgette" -> {"items":["courgette"],"targets":[]}\n' +
                        '  "high protein greek yoghurt 30% protein" -> ' +
                        '{"items":["greek yoghurt"],"targets":' +
                        '[{"nutrient":"protein","amount":30,"unit":"%"}]}\n' +
                        '  "tofu 500 calories 40g protein" -> ' +
                        '{"items":["tofu"],"targets":' +
                        '[{"nutrient":"calories","amount":500,"unit":"kcal"},' +
                        '{"nutrient":"protein","amount":40,"unit":"g"}]}',
                },
                { role: 'user', content: text },
            ],
        }),
    });

    if (!response.ok) throw new Error(`analyze HTTP ${response.status}`);
    const data = await response.json();
    return parseAnalysis(data.message?.content);
}

/** Runs the rules, then the candidate picker. Never splits the input. */
async function resolveOne(term) {
    const rows = await query(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
            SELECT * FROM resolve_food_detailed(:'q', 8)
        ) t;`,
        { q: term },
    );

    if (!rows.length) {
        return { status: 'no_match', query: term };
    }

    const top = rows[0];

    // A confident rule match needs no model.
    if (top.tier === 'confident') {
        return { status: 'ok', query: term, via: top.matched_via, food: top, model: null };
    }

    const candidates = rows.slice(0, 8);
    let chosen = null;
    let modelUsed = null;

    try {
        const picked = await askPicker(term, candidates);
        if (picked) {
            chosen = picked;
            modelUsed = PICKER_MODEL;
        }
    } catch (error) {
        console.error(`picker failed: ${String(error.message).slice(0, 120)}`);
    }

    if (!chosen) chosen = top;

    return {
        status: 'ok',
        query: term,
        via: chosen.matched_via,
        food: chosen,
        model: modelUsed,
        considered: candidates.length,
    };
}

/**
 * True when the rules produced nothing worth showing the user: either no rows
 * at all, or a top hit that matched on trigram noise alone. A "weak" tier means
 * no synonym and no description prefix claimed the term, so the result is a
 * guess. Those are exactly the cases worth a second opinion.
 */
function needsAnalysis(result) {
    if (result.status !== 'ok') return true;
    return result.food?.tier === 'weak';
}

async function resolve(term, { allowAnalysis = true } = {}) {
    const result = await resolveOne(term);

    if (!allowAnalysis || !needsAnalysis(result)) return result;

    let analysis;
    try {
        analysis = await analyzeQuery(term);
    } catch (error) {
        console.error(`analyze failed: ${String(error.message).slice(0, 120)}`);
        return result;
    }
    if (!analysis) return result;

    // Several foods: resolve each and hand back a list. The UI shows these as
    // collapsible cards instead of forcing one food out of a whole sentence.
    if (analysis.items.length > 1) {
        const items = await Promise.all(
            analysis.items.map((item) =>
                resolveOne(item).catch((error) => ({
                    status: 'no_match',
                    query: item,
                    error: String(error.message).slice(0, 120),
                })),
            ),
        );
        return {
            status: 'ok',
            query: term,
            multi: true,
            items,
            targets: analysis.targets,
            model: PICKER_MODEL,
        };
    }

    // One food that the model thinks was mistyped: look the correction up and
    // use it only if it actually resolves. The original text is kept alongside
    // so the UI can say what it searched for.
    const only = analysis.items[0];
    if (only && only !== term.trim().toLowerCase()) {
        const corrected = await resolveOne(only);
        if (corrected.status === 'ok') {
            return {
                ...corrected,
                query: term,
                correctedTo: only,
                targets: analysis.targets,
                model: corrected.model ?? PICKER_MODEL,
            };
        }
    }

    // Same food the rules already found, but the utterance carried a stated
    // goal. Nothing consumes the target yet; it is surfaced for display only.
    if (analysis.targets.length) {
        return { ...result, targets: analysis.targets };
    }

    return result;
}

/**
 * Identifies the audio container from its magic bytes.
 *
 * The browser sends audio/webm, but hard-coding that filename meant a WAV or
 * MP4 clip was rejected by OpenAI as "corrupted or unsupported" — the label said
 * webm while the bytes said otherwise. Sniffing keeps the endpoint usable from
 * any client and makes it testable.
 */
function sniffAudio(buffer) {
    const ascii = (from, to) => buffer.subarray(from, to).toString('latin1');

    if (buffer.length >= 4 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') {
        return { name: 'clip.wav', type: 'audio/wav' };
    }
    // EBML header covers webm and mkv.
    if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return { name: 'clip.webm', type: 'audio/webm' };
    }
    if (buffer.length >= 8 && ascii(4, 8) === 'ftyp') {
        return { name: 'clip.m4a', type: 'audio/mp4' };
    }
    if (buffer.length >= 3 && ascii(0, 3) === 'ID3') {
        return { name: 'clip.mp3', type: 'audio/mpeg' };
    }
    // Default to webm: that is what MediaRecorder produces in Chrome and Safari.
    return { name: 'clip.webm', type: 'audio/webm' };
}

/**
 * Cleans a raw transcript down to something worth searching for.
 *
 * Speech comes back with sentence punctuation and capitalisation: saying
 * "tomato" yields "Tomato." That trailing full stop used to break the exact
 * synonym match and drop the query to the fuzzy tier, where the model picked
 * "Tomatoes, green, raw". The resolver now normalises too, but stripping here
 * means the text shown back to the user ("Heard: ...") is also clean, and the
 * search box is not left holding a stray period.
 *
 * Only edge punctuation is removed. Interior characters are meaningful — the
 * comma in "tomato, red" and the hyphen in "extra-virgin" must survive.
 */
export function cleanTranscript(raw) {
    return String(raw ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        // Strip leading and trailing punctuation, keeping interior characters.
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .replace(/[^\p{L}\p{N}]+$/u, '')
        .trim();
}

/**
 * Transcribes an audio clip via OpenAI.
 *
 * Accepts the raw request body rather than a multipart upload, because the
 * browser sends one recording per utterance and there is no need for a full
 * multipart parser. The clip is re-wrapped as multipart for OpenAI.
 *
 * `keywords` is passed as a domain hint: OpenAI documents it as a hint only, so
 * it cannot inject words the speaker did not say, but it improves accuracy on
 * food names like courgette, aubergine and chickpeas.
 */
async function transcribe(buffer) {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not set');

    const { name, type } = sniffAudio(buffer);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type }), name);
    form.append('model', TRANSCRIBE_MODEL);
    form.append('keywords[]', 'courgette');
    form.append('keywords[]', 'aubergine');
    form.append('keywords[]', 'chickpeas');
    form.append('keywords[]', 'garbanzo');
    form.append('keywords[]', 'coriander');
    form.append('keywords[]', 'cilantro');
    form.append('keywords[]', 'capsicum');
    form.append('keywords[]', 'rocket');
    form.append('keywords[]', 'prawns');
    form.append('keywords[]', 'mince');
    form.append('languages[]', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
    });

    if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        throw new Error(`transcription failed (${response.status}): ${detail}`);
    }

    const data = await response.json();
    return cleanTranscript(data.text);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            // A spoken word is a few hundred KB; cap well above that so a
            // runaway upload cannot exhaust memory.
            if (size > 12 * 1024 * 1024) {
                reject(new Error('audio too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    try {
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const html = await readFile(join(here, 'lookup.html'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }

        // The certificate itself, so a phone can install and trust it once
        // instead of dismissing a warning on every visit.
        if (url.pathname === '/ca.pem') {
            if (!useTls) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('no certificate configured\n');
                return;
            }
            const pem = await readFile(certPath);
            res.writeHead(200, {
                'Content-Type': 'application/x-pem-file',
                'Content-Disposition': 'attachment; filename="mealmaker-lookup.pem"',
            });
            res.end(pem);
            return;
        }

        // POST an audio clip, get back { text }.
        if (req.method === 'POST' && url.pathname === '/api/transcribe') {
            const buffer = await readBody(req);
            const text = await transcribe(buffer);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ text }));
            return;
        }

        if (url.pathname === '/api/lookup') {
            const term = (url.searchParams.get('q') ?? '').trim();
            // `split=0` resolves the whole string as a single food. The UI
            // passes it when following up one item of a multi-food result, so a
            // plain "egg" is not re-analysed into a list.
            const allowAnalysis = url.searchParams.get('split') !== '0';
            if (term.length < 2) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'too_short' }));
                return;
            }
            const result = await resolve(term, { allowAnalysis });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
        console.error(`${url.pathname}:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
};

// Serve TLS when the generated certificate is present, plain http otherwise.
// The cert is self-signed, so the phone warns once; without TLS the browser
// refuses to expose getUserMedia at all and the mic button stays dead.
const certPath = join(here, 'certs', 'lookup-cert.pem');
const keyPath = join(here, 'certs', 'lookup-key.pem');
const useTls = existsSync(certPath) && existsSync(keyPath);

// Guarded so importing this file for tests does not bind any ports.
if (isMain) {
    const server = useTls
        ? createHttpsServer(
              { cert: await readFile(certPath), key: await readFile(keyPath) },
              handler,
          )
        : createHttpServer(handler);

    const port = PORT || (useTls ? 3443 : 3010);
    const scheme = useTls ? 'https' : 'http';

    server.listen(port, '0.0.0.0', () => {
        const lan = process.env.LAN_IP || '192.168.4.48';
        console.log(`Food lookup: ${scheme}://localhost:${port}`);
        console.log(`On your phone: ${scheme}://${lan}:${port}`);
        console.log(`Picker model: ${PICKER_MODEL}`);
        console.log(`Transcription: ${OPENAI_KEY ? TRANSCRIBE_MODEL : 'disabled (no OPENAI_API_KEY)'}`);
    });

    // A second plain-http listener kept for localhost only. Chromium treats
    // localhost as a secure context, so the mic still works there, and it avoids
    // having to accept the self-signed certificate on this machine. Other hosts
    // (the phone) are rejected so the network path stays TLS-only.
    if (useTls && !PORT) {
        createHttpServer((req, res) => {
            const remote = req.socket.remoteAddress ?? '';
            const local =
                remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
            if (!local) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end(`Use the https address: https://${process.env.LAN_IP || '192.168.4.48'}:${port}/\n`);
                return;
            }
            handler(req, res);
        }).listen(3010, '127.0.0.1', () => {
            console.log('Local http: http://localhost:3010');
        });
    }
}
