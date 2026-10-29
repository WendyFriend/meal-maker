// Dumps the raw response from one synonym request so the parsing failure can be
// diagnosed instead of guessed at.
const OLLAMA = 'http://localhost:11434';
const model = process.argv[2] ?? 'gemma3:4b';
// gemma4:* are reasoning models: they emit thinking tokens first, so the
// answer needs either think:false or a much larger num_predict.
const noThink = process.argv.includes('--no-think');
const budget = Number(process.env.BUDGET ?? 900);

const description = 'Eggplant, raw';
const SYSTEM =
    'You generate search terms for a recipe app. A user will type these into a ' +
    'search box to find an ingredient.\n' +
    'Give 4 to 8 SHORT terms, each 1 to 4 words, that real people would type.\n' +
    'Include regional and colloquial names - British, American, Australian - ' +
    'when the food has them.\n' +
    'Do NOT restate the USDA description. Do NOT include brand names.\n' +
    'Reply with ONLY a JSON array of strings.';

async function call(label, body) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            ...(noThink ? { think: false } : {}),
            ...body,
            options: { num_predict: budget, ...body.options },
        }),
    });
    const data = await response.json();
    console.log(`\n--- ${label} ---`);
    console.log('content:', JSON.stringify((data.message?.content ?? '').slice(0, 400)));
    console.log('thinkingLen:', (data.message?.thinking ?? '').length);
    console.log('eval_count:', data.eval_count, 'done_reason:', data.done_reason);
}

await call('format:json', {
    format: 'json',
    options: { temperature: 0.2, num_predict: 220 },
    messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `USDA food description: ${description}\n\nTerms:` },
    ],
});

await call('no-format', {
    options: { temperature: 0.2, num_predict: 220 },
    messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `USDA food description: ${description}\n\nTerms:` },
    ],
});

await call('format:json + json_schema', {
    format: {
        type: 'object',
        properties: { terms: { type: 'array', items: { type: 'string' } } },
        required: ['terms'],
    },
    options: { temperature: 0.2, num_predict: 220 },
    messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `USDA food description: ${description}\n\nTerms:` },
    ],
});
