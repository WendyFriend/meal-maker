// Tests prompt variants to see whether llama3.2:1b can rank at all, or whether
// the failure is the prompt rather than the model.
const OLLAMA = 'http://localhost:11434';

const QUERY = 'bread';
const CANDIDATES = [
    'Bread, egg',
    'Bread, rye',
    'Bread, wheat',
    'Bread, white, commercial',
    'Bread, whole-wheat, commercially prepared',
    'Bread, french or vienna (includes sourdough)',
    'Bread, pita, white, enriched',
    'Bread, stuffing, dry mix',
];
const EXPECTED_INDEX = 4; // 'Bread, white, commercial' is option 4

const VARIANTS = [
    {
        name: 'minimal-number',
        system: 'Reply with only the number.',
        user: `Ingredient: ${QUERY}\n${CANDIDATES.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nBest number:`,
    },
    {
        name: 'explicit-task',
        system:
            'You choose one item from a numbered list. You always reply with ' +
            'exactly one digit and nothing else.',
        user:
            `Which numbered option is plain white sandwich bread?\n` +
            `${CANDIDATES.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n` +
            'Answer with the number only:',
    },
    {
        name: 'fewshot',
        system: 'You pick from a numbered list and answer with one number.',
        user:
            'Ingredient: milk\n1. Milk, buttermilk, dried\n2. Milk, sheep, fluid\n3. Milk, whole, 3.25% milkfat\n4. Crackers, milk\n\nBest number: 3\n\n' +
            `Ingredient: ${QUERY}\n${CANDIDATES.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nBest number:`,
    },
    {
        name: 'json',
        system: 'Reply only with JSON like {"choice": 3}',
        user:
            `Ingredient: ${QUERY}\n` +
            `${CANDIDATES.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n` +
            'Reply with {"choice": N}',
    },
    {
        name: 'reverse-order',
        system: 'Reply with only the number of the best match.',
        user:
            `Ingredient: ${QUERY}\n` +
            [...CANDIDATES]
                .reverse()
                .map((c, i) => `${i + 1}. ${c}`)
                .join('\n') +
            '\n\nBest number:',
    },
];

for (const variant of VARIANTS) {
    const expected = variant.name === 'reverse-order'
        ? CANDIDATES.length - EXPECTED_INDEX + 1
        : EXPECTED_INDEX;

    const started = performance.now();
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.2:1b',
            stream: false,
            keep_alive: '30m',
            options: { temperature: 0, num_predict: 30 },
            messages: [
                { role: 'system', content: variant.system },
                { role: 'user', content: variant.user },
            ],
        }),
    });
    const ms = Math.round(performance.now() - started);
    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    const match = raw.match(/\d+/);
    const got = match ? Number(match[0]) : null;
    const ok = got === expected;

    console.log(
        `${variant.name.padEnd(16)} ${String(ms).padStart(5)}ms ${ok ? 'OK  ' : 'MISS'} ` +
            `expected ${expected}, got ${got} | raw=${JSON.stringify(raw.slice(0, 60))}`,
    );
}
