// Second-stage evaluation: can the model be made order-independent?
//
// The number-answer format invites position bias - the model may anchor on
// "1". Asking it to repeat the exact description instead forces it to read the
// text. If accuracy improves and the reversed-list probe stabilises, the model
// is usable and the earlier result was a prompting artefact.
//
// Usage: node db/ui/bench-text.mjs <model> [--no-think]
const OLLAMA = 'http://localhost:11434';

const model = process.argv[2];
// 'think' must be top-level in Ollama; nested inside options it is ignored.
const noThink = process.argv.includes('--no-think');
if (!model) {
    console.error('usage: node db/ui/bench-text.mjs <model> [--no-think]');
    process.exit(1);
}

const CASES = [
    {
        query: 'bread',
        expected: 'Bread, white, commercial',
        candidates: [
            'Bread, egg', 'Bread, rye', 'Bread, wheat', 'Bread, white, commercial',
            'Bread, whole-wheat, commercially prepared',
            'Bread, french or vienna (includes sourdough)',
            'Bread, pita, white, enriched', 'Bread, stuffing, dry mix',
        ],
    },
    {
        query: 'tomato',
        expected: 'Tomatoes, red, ripe, raw, year round average',
        candidates: [
            'Tomatoes, green, raw', 'Tomatoes, orange, raw', 'Tomatoes, yellow, raw',
            'Tomatoes, crushed, canned',
            'Tomatoes, red, ripe, raw, year round average',
            'Tomato powder', 'Tomato products, canned, sauce', 'Tomato, paste, canned',
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
            'Chicken, ground, raw', 'Chicken spread',
        ],
    },
    {
        query: 'olive oil',
        expected: 'Oil, olive, salad or cooking',
        candidates: [
            'Mayonnaise, reduced fat, with olive oil', 'Oil, olive, salad or cooking',
            'Oil, corn, peanut, and olive', 'Oil, canola', 'Olive tapenade',
            'Salad dressing, italian', 'Oil, coconut', 'Anchovies, canned in olive oil',
        ],
    },
    {
        query: 'canned tomatoes',
        expected: 'Tomatoes, red, ripe, canned, packed in tomato juice',
        candidates: [
            'Tomatoes, red, ripe, canned, packed in tomato juice',
            'Tomatoes, crushed, canned', 'Tomatoes, sun-dried',
            'Tomato products, canned, puree', 'Tomato juice, canned, with salt added',
            'Tomatoes, green, raw', 'Tomato powder', 'Tomatoes, red, ripe, raw',
        ],
    },
    {
        query: 'spinach',
        expected: 'Spinach, raw',
        candidates: [
            'Spinach, cooked, boiled, drained, without salt',
            'Spinach, canned, regular pack, drained solids', 'Spinach, raw',
            'Spinach souffle', 'Spinach, frozen, chopped or leaf, unprepared',
            'Mustard spinach, (tendergreen), raw', 'New Zealand spinach, raw', 'Spinach, baby',
        ],
    },
    {
        query: 'rice',
        expected: 'Rice, white, long-grain, regular, raw, enriched',
        candidates: [
            'Rice, black, unenriched, raw', 'Rice, brown, long-grain, raw',
            'Rice, white, long-grain, regular, raw, enriched', 'Rice crackers',
            'Rice flour, brown', 'Wild rice, raw', 'Rice noodles, dry', 'Rice bran, crude',
        ],
    },
    {
        query: 'milk',
        expected: 'Milk, whole, 3.25% milkfat, with added vitamin D',
        candidates: [
            'Milk, sheep, fluid', 'Milk, buttermilk, dried',
            'Milk, whole, 3.25% milkfat, with added vitamin D', 'Crackers, milk',
            'Milk, canned, condensed, sweetened', 'Milk, dry, nonfat',
            'Milk, indian buffalo, fluid', 'Milk, low sodium, fluid',
        ],
    },
];

const SYSTEM =
    'You are a food-matching assistant. A home cook names an ingredient and you ' +
    'receive candidate USDA food descriptions.\n' +
    'Choose the one that best matches what the cook means.\n' +
    'Prefer plain, raw, unprocessed, generic foods.\n' +
    'Reject flavoured, sweetened, canned, powdered, restaurant or baby-food ' +
    'versions unless the ingredient asks for them.\n' +
    'Reply with the chosen description copied exactly, and nothing else.';

async function ask(query, candidates) {
    const list = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const started = performance.now();
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model, stream: false, keep_alive: '10m',
            ...(noThink ? { think: false } : {}),
            options: { temperature: 0, num_predict: 60, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `Ingredient: ${query}\n\n${list}\n\nChosen description:` },
            ],
        }),
    });
    const ms = Math.round(performance.now() - started);
    if (!response.ok) return { ms, pick: null, raw: `HTTP ${response.status}` };

    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();

    // Match by containment either way, tolerating minor rewording.
    const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const needle = normalise(raw);
    const pick =
        candidates.find((c) => normalise(c) === needle) ??
        candidates.find((c) => needle.includes(normalise(c))) ??
        candidates.find((c) => normalise(c).includes(needle) && needle.length > 12) ??
        null;

    return { ms, pick, raw };
}

let correct = 0;
let answered = 0;
let totalMs = 0;

for (const testCase of CASES) {
    const result = await ask(testCase.query, testCase.candidates);
    totalMs += result.ms;
    if (result.pick) answered++;
    const ok = result.pick === testCase.expected;
    if (ok) correct++;
    console.log(
        `${testCase.query.padEnd(15)} ${String(result.ms).padStart(6)}ms ` +
            `${result.pick ? (ok ? 'OK  ' : 'MISS') : 'NOMATCH'}  -> ${result.pick ?? JSON.stringify(result.raw.slice(0, 50))}`,
    );
}

console.log(
    `\n${model} (text mode): answered ${answered}/${CASES.length}, correct ${correct}/${CASES.length}, ` +
        `avg ${Math.round(totalMs / CASES.length)}ms`,
);

const probe = CASES[1];
const normal = await ask(probe.query, probe.candidates);
const reversed = await ask(probe.query, [...probe.candidates].reverse());
console.log(
    `position bias: normal -> "${normal.pick}"  reversed -> "${reversed.pick}"  ` +
        `==> ${normal.pick === reversed.pick ? 'STABLE' : 'ORDER-DEPENDENT'}`,
);
