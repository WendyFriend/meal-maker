// Benchmarks llama3.2:1b on the re-ranking task before wiring it into the UI.
//
// The question that matters: can a 1B model reliably return a NUMBER, and how
// long does it take? Accuracy is secondary - the SQL ranker already gives a
// shortlist, so the model only has to pick from ~8 candidates.

const OLLAMA = 'http://localhost:11434';

const CASES = [
    {
        query: 'bread',
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
        expected: 'Bread, white, commercial',
    },
    {
        query: 'tomato',
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
        expected: 'Tomatoes, red, ripe, raw, year round average',
    },
    {
        query: 'chicken breast',
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
        expected: 'Chicken, broilers or fryers, breast, meat only, raw',
    },
    {
        query: 'olive oil',
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
        expected: 'Oil, olive, salad or cooking',
    },
    {
        query: 'canned tomatoes',
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
        expected: 'Tomatoes, red, ripe, canned, packed in tomato juice',
    },
];

const SYSTEM =
    'You pick the single food a home cook means. ' +
    'Prefer plain, raw, everyday foods over flavoured, processed, canned, ' +
    'powdered or restaurant versions. Reply with ONLY the number.';

async function ask(query, candidates) {
    const list = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const started = performance.now();

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.2:1b',
            stream: false,
            keep_alive: '30m',
            options: { temperature: 0, num_predict: 12 },
            messages: [
                { role: 'system', content: SYSTEM },
                {
                    role: 'user',
                    content: `Ingredient: ${query}\n\nCandidates:\n${list}\n\nAnswer with one number:`,
                },
            ],
        }),
    });

    const ms = Math.round(performance.now() - started);

    if (!response.ok) {
        return { ms, error: `${response.status} ${await response.text()}` };
    }

    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    const match = raw.match(/\d+/);
    const index = match ? Number(match[0]) - 1 : -1;

    return {
        ms,
        raw,
        pick: candidates[index],
        parseable: index >= 0 && index < candidates.length,
        evalCount: data.eval_count,
        promptEvalCount: data.prompt_eval_count,
    };
}

let correct = 0;
let parseable = 0;
let totalMs = 0;

for (const testCase of CASES) {
    const result = await ask(testCase.query, testCase.candidates);

    if (result.error) {
        console.log(`${testCase.query.padEnd(15)} ERROR ${result.error.slice(0, 100)}`);
        continue;
    }

    totalMs += result.ms;
    if (result.parseable) parseable++;
    const ok = result.pick === testCase.expected;
    if (ok) correct++;

    console.log(
        `${testCase.query.padEnd(15)} ${String(result.ms).padStart(5)}ms ` +
            `${result.parseable ? (ok ? 'OK  ' : 'MISS') : 'UNPARSED'}` +
            ` raw=${JSON.stringify(result.raw)}` +
            `${ok ? '' : `\n${''.padEnd(15)} picked: ${result.pick ?? '(none)'}`}`,
    );
}

console.log(
    `\nparseable ${parseable}/${CASES.length}  correct ${correct}/${CASES.length}  avg ${Math.round(totalMs / CASES.length)}ms`,
);
