// Tests synonym quality: can the model produce the regional/colloquial names a
// user would actually type?
//
// This is the decisive capability for the synonym pass. A model that only
// restates the USDA description ("Bread, white, commercial" -> "white
// commercial bread") is useless; the value is knowing that a British user types
// "courgette" and an American types "zucchini".
//
// Usage: node db/ui/bench-synonyms.mjs <model> [--no-think]
const OLLAMA = 'http://localhost:11434';

const model = process.argv[2];
// 'think' is a TOP-LEVEL Ollama request field, not an option. Putting it inside
// options is silently ignored, which is what made an earlier run return empty
// content from gemma4 (a reasoning model) while appearing to be configured.
const noThink = process.argv.includes('--no-think');
if (!model) {
    console.error('usage: node db/ui/bench-synonyms.mjs <model> [--no-think]');
    process.exit(1);
}

// Each case lists terms that MUST appear for the output to be useful. These are
// the regional and colloquial names that make a synonym layer worth having.
const CASES = [
    {
        description: 'Squash, summer, zucchini, includes skin, raw',
        mustHave: ['zucchini', 'courgette'],
    },
    {
        description: 'Eggplant, raw',
        mustHave: ['eggplant', 'aubergine'],
    },
    {
        description: 'Coriander (cilantro) leaves, raw',
        mustHave: ['coriander', 'cilantro'],
    },
    {
        description: 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw',
        mustHave: ['chickpea', 'garbanzo'],
    },
    {
        description: 'Sugars, powdered',
        mustHave: ['powdered sugar', 'icing sugar', 'confectioner'],
    },
    {
        description: 'Peppers, sweet, green, raw',
        mustHave: ['bell pepper', 'capsicum'],
    },
    {
        description: 'Beef, ground, 85% lean meat / 15% fat, raw',
        mustHave: ['ground beef', 'mince'],
    },
    {
        description: 'Arugula, raw',
        mustHave: ['arugula', 'rocket'],
    },
    {
        description: 'Crustaceans, shrimp, raw',
        mustHave: ['shrimp', 'prawn'],
    },
    {
        description: 'Rutabaga, raw',
        mustHave: ['rutabaga', 'swede', 'turnip'],
    },
    {
        description: 'Garbanzo beans, mature seeds, canned',
        mustHave: ['chickpea', 'garbanzo'],
    },
    {
        description: 'Beans, snap, green, raw',
        mustHave: ['green bean', 'string bean', 'french bean'],
    },
];

const SYSTEM =
    'You generate search terms for a recipe app. A user will type these into a ' +
    'search box to find an ingredient.\n' +
    'Give 4 to 8 SHORT terms, each 1 to 4 words, that real people would type.\n' +
    'Include regional and colloquial names - British, American, Australian - ' +
    'when the food has them.\n' +
    'Do NOT restate the USDA description. Do NOT include brand names.\n' +
    'Reply with ONLY a JSON array of strings.';

async function generate(description) {
    const started = performance.now();
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            ...(noThink ? { think: false } : {}),
            // A schema is needed: bare format:'json' makes small models emit an
            // object mapping instead of the array that was asked for.
            format: {
                type: 'object',
                properties: { terms: { type: 'array', items: { type: 'string' } } },
                required: ['terms'],
            },
            // num_ctx controls the KV cache allocation. Ollama defaults to 32k,
            // which is ~16x more than these ~250-token prompts need and wastes
            // both VRAM and prefill time.
            options: { temperature: 0.2, num_predict: 260, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM },
                {
                    role: 'user',
                    content: `USDA food description: ${description}\n\nTerms:`,
                },
            ],
        }),
    });

    const ms = Math.round(performance.now() - started);
    if (!response.ok) return { ms, terms: [], error: `HTTP ${response.status}` };

    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    const thinkingChars = (data.message?.thinking ?? '').length;

    if (!raw && thinkingChars > 0) {
        return { ms, terms: [], raw, error: `empty content, ${thinkingChars}chars thinking` };
    }

    let terms = [];

    /**
     * Extracts the first balanced JSON array from a string.
     *
     * A naive /\[[\s\S]*\]/ match is greedy and spans to the LAST bracket, so
     * a response with a trailing stray ']' (seen from some cloud models) yields
     * invalid JSON and silently zero terms. This walks the string tracking depth
     * and string state instead.
     */
    function firstJsonArray(text) {
        const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
        try {
            const whole = JSON.parse(cleaned);
            if (Array.isArray(whole)) return whole;
            if (whole && Array.isArray(whole.terms)) return whole.terms;
            if (whole && Array.isArray(whole.synonyms)) return whole.synonyms;
        } catch {
            /* fall through to scanning */
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

    terms = firstJsonArray(raw);

    // Junk filter: a term must be a plausible food name, not a fragment or a
    // vague category. These are the failure modes seen from small models.
    const VAGUE = /^(vegetable|fruit|food|meat|veggie|veggies|thing|purple veggie|green veggie)$/i;
    terms = terms
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && t.length <= 40)
        .filter((t) => !VAGUE.test(t))
        .filter((t) => (t.match(/\s/g) ?? []).length <= 4)
        .filter((t, i, all) => all.indexOf(t) === i);

    return { ms, terms, raw };
}

let covered = 0;
let totalTerms = 0;
let validTime = 0;
let cases = 0;

for (const testCase of CASES) {
    const result = await generate(testCase.description);
    if (result.error) {
        console.log(`${testCase.description.slice(0, 40).padEnd(42)} ERROR ${result.error}`);
        continue;
    }

    cases++;
    validTime += result.ms;
    totalTerms += result.terms.length;

    const joined = result.terms.join(' | ');
    const found = testCase.mustHave.filter((needle) =>
        joined.includes(needle.toLowerCase()),
    );
    const ok = found.length === testCase.mustHave.length;
    if (ok) covered++;

    console.log(
        `\n${ok ? 'OK  ' : 'MISS'} ${testCase.description.slice(0, 46)}` +
            `\n      got (${result.terms.length}): ${joined}` +
            `\n      need: ${testCase.mustHave.join(', ')}` +
            `${ok ? '' : `  → missing: ${testCase.mustHave.filter((m) => !found.includes(m)).join(', ')}`}`,
    );
}

console.log(
    `\n=== ${model}: ${covered}/${cases} cases fully covered, ` +
        `avg ${(totalTerms / Math.max(cases, 1)).toFixed(1)} terms each, ` +
        `avg ${Math.round(validTime / Math.max(cases, 1))}ms ===`,
);
