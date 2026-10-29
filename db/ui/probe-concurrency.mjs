// Measures whether Ollama cloud actually serves requests concurrently, and how
// much of the batch time is HTTP versus psql subprocess overhead.
//
// Ollama's pricing page states per-plan concurrency limits (Free: 1, Pro: 3,
// Max/Team: 10). If the account is limited to 1, parallel requests just queue
// and there is no speed-up - so this is measured rather than assumed.

const OLLAMA = 'http://localhost:11434';
const MODEL = 'gemma4:cloud';

const SYSTEM =
    'You generate ingredient search terms. Reply with ONLY a JSON array of lowercase strings.';

async function one(i) {
    const started = performance.now();
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL,
            stream: false,
            keep_alive: '30m',
            think: false,
            options: { temperature: 0.2, num_predict: 80, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `USDA food description: Test food ${i}\n\nNames:` },
            ],
        }),
    });
    const ms = Math.round(performance.now() - started);
    return { i, ms, ok: response.ok };
}

// Sequential baseline
const seqStart = performance.now();
for (let i = 0; i < 8; i++) await one(i);
const seqMs = Math.round(performance.now() - seqStart);

// Parallel
const parStart = performance.now();
const results = await Promise.all(Array.from({ length: 8 }, (_, i) => one(i)));
const parMs = Math.round(performance.now() - parStart);

console.log(`sequential 8 requests : ${seqMs}ms  (avg ${Math.round(seqMs / 8)}ms each)`);
console.log(`parallel   8 requests : ${parMs}ms  (avg ${Math.round(parMs / 8)}ms each)`);
console.log(`individual latencies  : ${results.map((r) => r.ms).join(', ')}ms`);
console.log(`speed-up              : ${(seqMs / parMs).toFixed(2)}x`);
console.log(
    parMs > seqMs * 0.75
        ? '\n=> little or no parallelism: requests are likely queued by concurrency limit'
        : '\n=> genuine parallelism',
);
