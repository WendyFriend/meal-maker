// Tests large batches: 50 and 100 foods per request.
//
// The prior probe only went to 20. Two things could break at larger sizes:
//   1. output truncation - num_predict must scale with batch size
//   2. structural failure - one bad id can invalidate the whole JSON object
//
// Measures wall-clock per food, success rate, and tokens per food so the
// trade-off is visible rather than assumed.
const OLLAMA = 'http://localhost:11434';
const MODEL = 'gemma4:cloud';

// 120 realistic descriptions to slice into batches.
const FOODS = [
    'Spinach, raw', 'Kale, raw', 'Rhubarb, raw', 'Carrots, raw',
    'Onions, raw', 'Garlic, raw', 'Broccoli, raw', 'Cauliflower, raw',
    'Tomatoes, red, ripe, raw, year round average',
    'Tomatoes, red, ripe, canned, packed in tomato juice',
    'Potatoes, flesh and skin, raw', 'Sweet potato, raw',
    'Bananas, raw', 'Apples, raw, with skin', 'Oranges, raw, all commercial varieties',
    'Strawberries, raw', 'Blueberries, raw', 'Avocados, raw, all commercial varieties',
    'Cucumber, with peel, raw', 'Lettuce, iceberg, raw',
    'Rice, white, long-grain, regular, raw, enriched', 'Rice, brown, long-grain, raw',
    'Oats', 'Quinoa, uncooked', 'Bread, white, commercial',
    'Bread, whole-wheat, commercially prepared', 'Pasta, dry, enriched',
    'Flour, wheat, all-purpose, enriched, bleached',
    'Beans, black, mature seeds, raw',
    'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw',
    'Lentils, raw', 'Peanuts, all types, raw', 'Almonds, raw', 'Walnuts, english',
    'Sesame seed kernels, dried', 'Olive oil', 'Butter, salted', 'Cheese, cheddar',
    'Yogurt, plain, whole milk', 'Milk, whole, 3.25% milkfat, with added vitamin D',
    'Lamb, New Zealand, imported, hind-shank, separable lean and fat, raw',
    'Lamb, New Zealand, imported, loin, boneless, separable lean and fat, raw',
    'Lamb, New Zealand, imported, neck chops, separable lean and fat, raw',
    'Veal, leg, top round, cap off, cutlet, boneless, raw',
    'Veal, shank, separable lean only, raw',
    'Chicken, broilers or fryers, breast, meat only, raw',
    'Chicken, broilers or fryers, thigh, meat only, raw',
    'Chicken, broilers or fryers, wing, meat only, raw',
    'Turkey, whole, meat only, raw', 'Duck, domesticated, meat only, raw',
    'Pork, fresh, loin, tenderloin, separable lean only, raw',
    'Pork, fresh, shoulder, whole, separable lean only, raw',
    'Beef, grass-fed, ground, raw', 'Beef, ground, 85% lean meat / 15% fat, raw',
    'Beef, chuck, arm pot roast, separable lean only, raw',
    'Fish, salmon, Atlantic, farmed, raw', 'Fish, tuna, light, canned in water, drained',
    'Fish, cod, Atlantic, raw', 'Fish, tilapia, raw',
    'Crustaceans, shrimp, raw', 'Mollusks, oyster, eastern, raw',
    'Celery, raw', 'Asparagus, raw', 'Brussels sprouts, raw', 'Cabbage, raw',
    'Beets, raw', 'Radishes, raw', 'Turnips, raw', 'Parsnips, raw',
    'Eggplant, raw', 'Peppers, sweet, green, raw', 'Peppers, sweet, red, raw',
    'Mushrooms, white, raw', 'Zucchini, includes skin, raw',
    'Squash, winter, butternut, raw', 'Pumpkin, raw',
    'Peaches, raw', 'Pears, raw', 'Plums, raw', 'Cherries, sweet, raw',
    'Grapes, red or green, raw', 'Mangoes, raw', 'Pineapple, raw, all varieties',
    'Watermelon, raw', 'Cantaloupe, raw', 'Honeydew melon, raw',
    'Kiwi fruit, raw', 'Papayas, raw', 'Pomegranate, raw', 'Figs, raw',
    'Dates, medjool', 'Raisins, seedless', 'Prunes, dried',
    'Corn, sweet, yellow, raw', 'Peas, green, raw', 'Beans, snap, green, raw',
    'Lima beans, immature seeds, raw', 'Soybeans, mature seeds, raw',
    'Rice, wild, raw', 'Buckwheat groats, roasted, dry', 'Barley, pearled, raw',
    'Millet, raw', 'Sorghum grain', 'Rye grain', 'Triticale flour, whole-grain',
    'Couscous, dry', 'Bulgur, dry', 'Cornmeal, whole-grain, yellow',
    'Wheat flour, whole-grain', 'Rice flour, white, unenriched',
    'Coconut milk, raw', 'Almond milk, unsweetened, plain, refrigerated',
    'Soy milk, sweetened, plain, refrigerated', 'Oat milk, unsweetened, plain',
    'Cream, fluid, heavy whipping', 'Cheese, mozzarella, whole milk',
    'Cheese, parmesan, grated', 'Cheese, feta', 'Cheese, ricotta, whole milk',
    'Egg, whole, raw, fresh', 'Egg, white, raw, fresh', 'Egg, yolk, raw, fresh',
    'Honey', 'Sugars, granulated', 'Sugars, brown', 'Molasses',
    'Oil, coconut', 'Oil, canola', 'Oil, sunflower, high oleic',
    'Vinegar, cider', 'Soy sauce made from soy and wheat (shoyu)',
];

// Batch sizes to compare. 100 is the user's suggestion.
const SIZES = [20, 50, 100];

const SYSTEM =
    'You generate ingredient search terms for a recipe app.\n' +
    'You receive a JSON object mapping an id to a USDA food description.\n' +
    'For each id, return the real names people use, including regional names.\n' +
    'Give only genuine names; do not pad. Reply with ONLY a JSON object mapping ' +
    'each id to an array of lowercase strings.';

function firstJsonObject(text) {
    const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const start = cleaned.indexOf('{');
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
            }
        }
    }
    return null;
}

async function callBatch(group) {
    const payload = {};
    group.forEach((d, i) => { payload[String(i)] = d; });

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL, stream: false, keep_alive: '30m', think: false,
            options: {
                temperature: 0.2,
                // Scale output budget with batch size or the JSON truncates.
                num_predict: 200 + group.length * 90,
                num_ctx: 8192,
            },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `Foods:\n${JSON.stringify(payload, null, 1)}` },
            ],
        }),
    });

    const data = await response.json();
    const text = (data.message?.content ?? '').trim();
    const parsed = firstJsonObject(text);

    let got = 0;
    if (parsed) {
        for (let i = 0; i < group.length; i++) {
            const v = parsed[String(i)];
            if (Array.isArray(v) && v.length > 0) got++;
        }
    }

    return {
        got,
        total: group.length,
        out: data.eval_count ?? 0,
        in: data.prompt_eval_count ?? 0,
        truncated: data.done_reason === 'length',
    };
}

const CONCURRENCY = 4;
const SAMPLE = FOODS.slice(0, 120);

console.log(`testing ${SAMPLE.length} foods at concurrency ${CONCURRENCY}\n`);
console.log('batch | wall s | ok  | ok % | trunc | out/food | in/food | foods/s');

for (const size of SIZES) {
    const batches = [];
    for (let i = 0; i < SAMPLE.length; i += size) batches.push(SAMPLE.slice(i, i + size));

    const started = performance.now();
    let ok = 0;
    let truncated = 0;
    let out = 0;
    let inp = 0;

    let next = 0;
    const runners = Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
        while (next < batches.length) {
            const batch = batches[next++];
            try {
                const r = await callBatch(batch);
                ok += r.got;
                out += r.out;
                inp += r.in;
                if (r.truncated) truncated++;
            } catch {
                /* count as lost */
            }
        }
    });
    await Promise.all(runners);

    const wall = (performance.now() - started) / 1000;
    console.log(
        `${String(size).padStart(5)} | ${wall.toFixed(1).padStart(6)} | ` +
            `${String(ok).padStart(3)} | ${((ok / SAMPLE.length) * 100).toFixed(0).padStart(4)}% | ` +
            `${String(truncated).padStart(5)} | ${String(Math.round(out / Math.max(ok, 1))).padStart(8)} | ` +
            `${String(Math.round(inp / Math.max(ok, 1))).padStart(7)} | ${(ok / wall).toFixed(1).padStart(7)}`,
    );
}
