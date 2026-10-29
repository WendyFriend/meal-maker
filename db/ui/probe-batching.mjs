// Tests whether batching N foods into one request is faster than N requests.
//
// The economics are not obvious in advance:
//   * one request with 10 foods cuts HTTP round-trips and prompt overhead
//   * but output grows with the batch, and output tokens are the expensive,
//     serial part - generation is sequential per token
//   * a malformed batch loses ALL the foods in it, not just one
//
// So this measures wall-clock throughput AND structural failure rate.
const OLLAMA = 'http://localhost:11434';
const MODEL = 'gemma4:cloud';
const CONCURRENCY = 8;

// 40 realistic descriptions, split into batches of 1, 4, 8, and 20.
const FOODS = [
    'Spinach, raw', 'Kale, raw', 'Rhubarb, raw', 'Carrots, raw',
    'Onions, raw', 'Garlic, raw', 'Broccoli, raw', 'Cauliflower, raw',
    'Tomatoes, red, ripe, raw, year round average',
    'Tomatoes, red, ripe, canned, packed in tomato juice',
    'Potatoes, flesh and skin, raw', 'Sweet potato, raw',
    'Bananas, raw', 'Apples, raw, with skin', 'Oranges, raw, all commercial varieties',
    'Strawberries, raw', 'Blueberries, raw', 'Avocados, raw, all commercial varieties',
    'Cucumber, with peel, raw', 'Lettuce, iceberg, raw',
    'Rice, white, long-grain, regular, raw, enriched',
    'Rice, brown, long-grain, raw', 'Oats', 'Quinoa, uncooked',
    'Bread, white, commercial', 'Bread, whole-wheat, commercially prepared',
    'Pasta, dry, enriched', 'Flour, wheat, all-purpose, enriched, bleached',
    'Beans, black, mature seeds, raw', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw',
    'Lentils, raw', 'Peanuts, all types, raw',
    'Almonds, raw', 'Walnuts, english', 'Sesame seed kernels, dried',
    'Olive oil', 'Butter, salted', 'Cheese, cheddar',
    'Yogurt, plain, whole milk', 'Milk, whole, 3.25% milkfat, with added vitamin D',
];

const SYSTEM_SINGLE =
    'You generate ingredient search terms for a recipe app.\n' +
    'Give the real names people use, including regional names.\n' +
    'Give only genuine names; do not pad.\n' +
    'Reply with ONLY a JSON array of lowercase strings.';

const SYSTEM_BATCH =
    'You generate ingredient search terms for a recipe app.\n' +
    'You receive a JSON object mapping an id to a USDA food description.\n' +
    'For each id, return the real names people use, including regional names.\n' +
    'Give only genuine names; do not pad.\n' +
    'Reply with ONLY a JSON object mapping each id to an array of lowercase strings.';

async function callSingle(description) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL, stream: false, keep_alive: '30m', think: false,
            options: { temperature: 0.2, num_predict: 200, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM_SINGLE },
                { role: 'user', content: `USDA food description: ${description}\n\nNames:` },
            ],
        }),
    });
    const data = await response.json();
    const text = (data.message?.content ?? '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    let ok = false;
    if (start >= 0 && end > start) {
        try {
            const parsed = JSON.parse(text.slice(start, end + 1));
            ok = Array.isArray(parsed) && parsed.length > 0;
        } catch {
            ok = false;
        }
    }
    return { ok, out: data.eval_count ?? 0, in: data.prompt_eval_count ?? 0 };
}

async function callBatch(descriptions) {
    const payload = {};
    descriptions.forEach((d, i) => {
        payload[String(i)] = d;
    });

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL, stream: false, keep_alive: '30m', think: false,
            // Output scales with batch size, so the budget must too.
            options: { temperature: 0.2, num_predict: 200 + descriptions.length * 90, num_ctx: 4096 },
            messages: [
                { role: 'system', content: SYSTEM_BATCH },
                { role: 'user', content: `Foods:\n${JSON.stringify(payload, null, 1)}` },
            ],
        }),
    });
    const data = await response.json();
    const text = (data.message?.content ?? '').trim();

    // Count how many ids got a usable array back.
    let got = 0;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            const parsed = JSON.parse(text.slice(start, end + 1));
            for (const key of Object.keys(payload)) {
                const value = parsed[key];
                if (Array.isArray(value) && value.length > 0) got++;
            }
        } catch {
            got = 0;
        }
    }

    return { got, total: descriptions.length, out: data.eval_count ?? 0, in: data.prompt_eval_count ?? 0 };
}

// Worker pool so each strategy gets the same concurrency ceiling.
async function pool(items, worker, concurrency) {
    const results = [];
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

console.log(`comparing request batching at concurrency ${CONCURRENCY}\n`);
console.log('batch | wall s | foods ok | ok % | out tok/food | in tok/food');

for (const size of [1, 4, 8, 20]) {
    const batches = [];
    for (let i = 0; i < FOODS.length; i += size) batches.push(FOODS.slice(i, i + size));

    const started = performance.now();
    let okFoods = 0;
    let outTokens = 0;
    let inTokens = 0;

    await pool(
        batches,
        async (batch) => {
            try {
                const r = batch.length === 1 ? await callSingle(batch[0]) : await callBatch(batch);
                okFoods += batch.length === 1 ? (r.ok ? 1 : 0) : r.got;
                outTokens += r.out;
                inTokens += r.in;
            } catch {
                /* count as failure */
            }
        },
        CONCURRENCY,
    );

    const wall = (performance.now() - started) / 1000;
    console.log(
        `${String(size).padStart(5)} | ${wall.toFixed(1).padStart(6)} | ` +
            `${String(okFoods).padStart(8)} | ${((okFoods / FOODS.length) * 100).toFixed(0).padStart(4)}% | ` +
            `${String(Math.round(outTokens / Math.max(okFoods, 1))).padStart(12)} | ${String(Math.round(inTokens / Math.max(okFoods, 1))).padStart(11)}`,
    );
}
