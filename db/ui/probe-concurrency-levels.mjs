// Finds the concurrency sweet spot for ollama.com.
//
// The account's plan caps server-side concurrency (free 1, pro 3, max/team 10),
// so past that point extra parallelism only queues and adds latency without
// improving throughput. This measures each level rather than assuming.
const OLLAMA = 'http://localhost:11434';
const MODEL = 'gemma4:cloud';

const SYSTEM = 'Reply with ONLY a JSON array of 2 lowercase food names.';

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
            options: { temperature: 0, num_predict: 40, num_ctx: 1024 },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `Food ${i}:` },
            ],
        }),
    });
    await response.json();
    return Math.round(performance.now() - started);
}

const LEVELS = [1, 4, 8, 12, 16, 24];
const PER_LEVEL = 24;

console.log(`measuring ${PER_LEVEL} requests at each concurrency level\n`);
console.log('concurrency | total ms | per-request ms | req/sec');

for (const level of LEVELS) {
    const started = performance.now();
    let sent = 0;

    // Simple fixed-size worker pool.
    const workers = Array.from({ length: Math.min(level, PER_LEVEL) }, async () => {
        while (sent < PER_LEVEL) {
            const i = sent++;
            await one(i);
        }
    });

    await Promise.all(workers);
    const total = Math.round(performance.now() - started);
    console.log(
        `${String(level).padStart(11)} | ${String(total).padStart(8)} | ` +
            `${String(Math.round(total / PER_LEVEL)).padStart(14)} | ` +
            `${((PER_LEVEL / total) * 1000).toFixed(2).padStart(7)}`,
    );
}
