// Benchmarks one local model on the food re-ranking task.
//
// Usage: node db/ui/bench-one.mjs <model> [--think=false]
//
// Three signals matter, in order:
//   1. does it emit a parseable number at all (format reliability)
//   2. does it pick the intuitively correct food
//   3. is the pick stable when the candidate order is reversed (position bias)
//
// Signal 3 is the one that exposes a model that is not actually reading the
// list: a model answering "1" every time passes 1 and fails 3.
const OLLAMA = 'http://localhost:11434';

const model = process.argv[2];
const extraOptions = {};

for (const arg of process.argv.slice(3)) {
    if (arg === '--no-think') extraOptions.think = false;
}
if (!model) {
    console.error('usage: node db/ui/bench-one.mjs <model> [--no-think]');
    process.exit(1);
}

const CASES = [
    {
        query: 'bread',
        expected: 'Bread, white, commercial',
        candidates: [
            'Bread, egg',
            'Bread, rye',
            'Bread, wheat',
            'Bread, white, commercial',
            'Bread, whole-wheat, commercially prepared',
            'Bread, french or vienna (includes sourdough)',
            'Bread, pita, white, enriched',
            'Bread, stuffing, dry mix',
        ],
    },
    {
        query: 'tomato',
        expected: 'Tomatoes, red, ripe, raw, year round average',
        candidates: [
            'Tomatoes, green, raw',
            'Tomatoes, orange, raw',
            'Tomatoes, yellow, raw',
            'Tomatoes, crushed, canned',
            'Tomatoes, red, ripe, raw, year round average',
            'Tomato powder',
            'Tomato products, canned, sauce',
            'Tomato, paste, canned',
        ],
    },
    {
        query: 'chicken breast',
        expected: 'Chicken, broilers or fryers, breast, meat only, raw',
        candidates: [
            'Chicken breast, roll, oven-roasted',
            'Chicken breast tenders, breaded, uncooked',
            'Chicken, broilers or fryers, breast, meat only, raw',
            'Chicken, broilers or fryers, breast, meat and skin, raw',
            'Lunchmeat, chicken breast, sliced',
            'Chicken, broilers or fryers, breast, meat only, cooked',
            'Chicken, ground, raw',
            'Chicken spread',
        ],
    },
    {
        query: 'olive oil',
        expected: 'Oil, olive, salad or cooking',
        candidates: [
            'Mayonnaise, reduced fat, with olive oil',
            'Oil, olive, salad or cooking',
            'Oil, corn, peanut, and olive',
            'Oil, canola',
            'Olive tapenade',
            'Salad dressing, italian',
            'Oil, coconut',
            'Anchovies, canned in olive oil',
        ],
    },
    {
        query: 'canned tomatoes',
        expected: 'Tomatoes, red, ripe, canned, packed in tomato juice',
        candidates: [
            'Tomatoes, red, ripe, canned, packed in tomato juice',
            'Tomatoes, crushed, canned',
            'Tomatoes, sun-dried',
            'Tomato products, canned, puree',
            'Tomato juice, canned, with salt added',
            'Tomatoes, green, raw',
            'Tomato powder',
            'Tomatoes, red, ripe, raw',
        ],
    },
    {
        query: 'spinach',
        expected: 'Spinach, raw',
        candidates: [
            'Spinach, cooked, boiled, drained, without salt',
            'Spinach, canned, regular pack, drained solids',
            'Spinach, raw',
            'Spinach souffle',
            'Spinach, frozen, chopped or leaf, unprepared',
            'Mustard spinach, (tendergreen), raw',
            'New Zealand spinach, raw',
            'Spinach, baby',
        ],
    },
    {
        query: 'rice',
        expected: 'Rice, white, long-grain, regular, raw, enriched',
        candidates: [
            'Rice, black, unenriched, raw',
            'Rice, brown, long-grain, raw',
            'Rice, white, long-grain, regular, raw, enriched',
            'Rice crackers',
            'Rice flour, brown',
            'Wild rice, raw',
            'Rice noodles, dry',
            'Rice bran, crude',
        ],
    },
    {
        query: 'milk',
        expected: 'Milk, whole, 3.25% milkfat, with added vitamin D',
        candidates: [
            'Milk, sheep, fluid',
            'Milk, buttermilk, dried',
            'Milk, whole, 3.25% milkfat, with added vitamin D',
            'Crackers, milk',
            'Milk, canned, condensed, sweetened',
            'Milk, dry, nonfat',
            'Milk, indian buffalo, fluid',
            'Milk, low sodium, fluid',
        ],
    },
];

const SYSTEM =
    'You are a food-matching assistant. From a numbered list of USDA food ' +
    'descriptions, choose the ONE that best matches what a home cook means by ' +
    'the ingredient.\n' +
    'Prefer plain, raw, unprocessed, generic foods.\n' +
    'Reject flavoured, sweetened, canned, powdered, restaurant or baby-food ' +
    'versions unless the ingredient explicitly asks for them.\n' +
    'Reply with ONLY the number of the best option. No words, no punctuation.';

async function ask(query, candidates, options = {}) {
    const list = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const started = performance.now();

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            // 'think' is a TOP-LEVEL field in Ollama, not an option. Nested, it
            // is silently ignored and reasoning models return empty content.
            ...(extraOptions.think === false ? { think: false } : {}),
            keep_alive: '10m',
            // Ollama defaults to a 32k context, ~130x more than these ~250-token
            // prompts need. Pinning it low cuts KV cache VRAM and prefill time.
            options: { temperature: 0, num_predict: 24, num_ctx: 2048, ...options },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `Ingredient: ${query}\n\n${list}\n\nNumber:` },
            ],
        }),
    });

    const ms = Math.round(performance.now() - started);
    if (!response.ok) {
        return { ms, error: `${response.status} ${(await response.text()).slice(0, 150)}` };
    }

    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    const match = raw.match(/\d+/);
    const index = match ? Number(match[0]) - 1 : -1;

    return {
        ms,
        raw,
        pick: candidates[index] ?? null,
        parseable: index >= 0 && index < candidates.length,
        loadMs: Math.round((data.load_duration ?? 0) / 1e6),
    };
}

let correct = 0;
let parseable = 0;
let totalMs = 0;
const failures = [];

for (const testCase of CASES) {
    const result = await ask(testCase.query, testCase.candidates, extraOptions);

    if (result.error) {
        console.log(`${testCase.query.padEnd(15)} ERROR ${result.error}`);
        continue;
    }

    totalMs += result.ms;
    if (result.parseable) parseable++;
    const ok = result.pick === testCase.expected;
    if (ok) correct++;
    else failures.push(`${testCase.query} -> ${result.pick ?? '(no answer)'} [${JSON.stringify(result.raw.slice(0, 20))}]`);

    console.log(
        `${testCase.query.padEnd(15)} ${String(result.ms).padStart(6)}ms ` +
            `${result.parseable ? (ok ? 'OK  ' : 'MISS') : 'UNPARSED'}` +
            `  -> ${result.pick ?? '(none)'}`,
    );
}

console.log(
    `\n${model}: parseable ${parseable}/${CASES.length}, correct ${correct}/${CASES.length}, ` +
        `avg ${Math.round(totalMs / CASES.length)}ms`,
);
if (failures.length) console.log(`misses:\n  ${failures.join('\n  ')}`);

// --- positional bias probe ---------------------------------------------
// Same food list, reversed. A model that picks "1" both times is not reading
// the candidates, so its "correct" answers were luck.
const probe = CASES[1]; // tomato: expected answer is in the middle
const normal = await ask(probe.query, probe.candidates, extraOptions);
const reversedList = [...probe.candidates].reverse();
const reversed = await ask(probe.query, reversedList, extraOptions);

const sameFood = normal.pick === reversed.pick;
console.log(
    `\nposition bias: normal -> "${normal.pick}"  reversed -> "${reversed.pick}"  ` +
        `==> ${sameFood ? 'STABLE (same food both ways)' : 'ORDER-DEPENDENT'}`,
);
