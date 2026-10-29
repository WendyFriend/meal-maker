// Inspects raw Ollama responses to see why qwen3 returns nothing, and tests a
// third local model for comparison.
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

const list = CANDIDATES.map((c, i) => `${i + 1}. ${c}`).join('\n');

async function raw(model, options = {}) {
    const started = performance.now();
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            options: { temperature: 0, num_predict: 64, ...options },
            messages: [
                {
                    role: 'system',
                    content: 'You choose the best match from a numbered list. Reply with ONLY the number.',
                },
                { role: 'user', content: `Ingredient: ${QUERY}\n\n${list}\n\nBest number:` },
            ],
        }),
    });
    const ms = Math.round(performance.now() - started);
    if (!response.ok) return { ms, error: `${response.status} ${(await response.text()).slice(0, 120)}` };

    const data = await response.json();
    return {
        ms,
        content: data.message?.content,
        thinking: data.message?.thinking,
        evalCount: data.eval_count,
        doneReason: data.done_reason,
        totalMs: Math.round((data.total_duration ?? 0) / 1e6),
    };
}

console.log('=== qwen3:4b with think:false ===');
console.log(JSON.stringify(await raw('qwen3:4b', { think: false }), null, 2));

console.log('\n=== qwen3:4b with think:true (full response) ===');
const t = await raw('qwen3:4b', { think: true, num_predict: 400 });
console.log(
    JSON.stringify(
        { ...t, content: t.content?.slice(0, 120), thinking: t.thinking?.slice(0, 200) },
        null,
        2,
    ),
);

console.log('\n=== gemma4:e2b-it-q4_K_M ===');
console.log(JSON.stringify(await raw('gemma4:e2b-it-q4_K_M'), null, 2));

console.log('\n=== deepseek-r1:7b ===');
console.log(JSON.stringify(await raw('deepseek-r1:7b'), null, 2));
