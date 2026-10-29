// Compares local models on the same re-ranking task.
//
// The reverse-order case is the key diagnostic: if a model answers "1" for both
// a list and its reversal, it is not evaluating the candidates at all - it is
// defaulting to the first token.
const OLLAMA = 'http://localhost:11434';

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
];

const SYSTEM =
    'You choose the single best match from a numbered list of foods. ' +
    'Prefer plain, raw, unprocessed everyday foods. Reply with ONLY the number.';

async function ask(model, query, candidates, extraOptions = {}) {
    const list = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const started = performance.now();

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '30m',
            options: { temperature: 0, num_predict: 16, ...extraOptions },
            messages: [
                { role: 'system', content: SYSTEM },
                {
                    role: 'user',
                    content: `Ingredient: ${query}\n\n${list}\n\nBest number:`,
                },
            ],
        }),
    });

    const ms = Math.round(performance.now() - started);
    if (!response.ok) return { ms, error: `${response.status}` };

    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    const match = raw.match(/\d+/);
    const index = match ? Number(match[0]) - 1 : -1;
    return { ms, raw, pick: candidates[index] ?? null };
}

async function runModel(model, label, options = {}) {
    let correct = 0;
    let firstPick = 0;
    let totalMs = 0;
    const rows = [];

    for (const testCase of CASES) {
        const result = await ask(model, testCase.query, testCase.candidates, options);
        totalMs += result.ms;
        const expectedIndex = testCase.candidates.indexOf(testCase.expected);
        if (result.pick === testCase.expected) correct++;
        if (expectedIndex === 0 && result.pick === testCase.candidates[0]) firstPick++;
        rows.push(
            `  ${testCase.query.padEnd(15)} ${String(result.ms).padStart(6)}ms ` +
                `${result.pick === testCase.expected ? 'OK  ' : 'MISS'} ` +
                `raw=${JSON.stringify((result.raw ?? '').slice(0, 24))} -> ${result.pick ?? 'none'}`,
        );
    }

    console.log(`\n${label}: ${correct}/${CASES.length} correct, avg ${Math.round(totalMs / CASES.length)}ms`);
    console.log(rows.join('\n'));
}

// Positional-bias probe: same list reversed. A model that answers "1" both
// times is not reading the candidates.
async function probePositionalBias(model) {
    const testCase = CASES[0];
    const normal = await ask(model, testCase.query, testCase.candidates);
    const reversedList = [...testCase.candidates].reverse();
    const reversed = await ask(model, testCase.query, reversedList);

    const normalIndex = testCase.candidates.indexOf(normal.pick);
    const reversedIndex = reversedList.indexOf(reversed.pick);
    const sameItem = normal.pick === reversed.pick;

    console.log(
        `\npositional bias (${model}): normal pick #${normalIndex + 1}, reversed pick #${reversedIndex + 1} ` +
            `-> ${sameItem ? 'SAME FOOD (good)' : 'DIFFERENT FOOD (order-dependent)'}`,
    );
}

const models = [
    ['llama3.2:1b', 'llama3.2:1b'],
    ['qwen3:4b', 'qwen3:4b'],
];

for (const [model, label] of models) {
    // qwen3 emits reasoning tokens unless thinking is disabled; without this it
    // spends its whole budget thinking and returns no digit.
    const options = model.startsWith('qwen3') ? { think: false } : {};
    await runModel(model, label, options);
}

await probePositionalBias('llama3.2:1b');
