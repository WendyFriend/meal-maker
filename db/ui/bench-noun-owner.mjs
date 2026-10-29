// Tests LLM arbitration for bare-noun ownership.
//
// The idea: when several foods could claim the same bare noun ("tomatoes"),
// ask the model which one the bare noun actually refers to, and award it there.
//
// This is narrower than general ranking - the question is explicit and the
// candidates are all the same food in different states - so it may succeed
// where general ranking hit 6/8.
//
// Every case has a known correct owner, so accuracy is measurable.
//
// Usage: node db/ui/bench-noun-owner.mjs <model> [--no-think]
const OLLAMA = 'http://localhost:11434';

const model = process.argv[2] ?? 'gemma4:12b';
const noThink = process.argv.includes('--no-think');

// bare noun -> candidates (shuffled per run so position bias is visible)
const CASES = [
    {
        noun: 'tomatoes',
        owner: 'Tomatoes, red, ripe, raw, year round average',
        candidates: [
            'Tomatoes, red, ripe, raw, year round average',
            'Tomatoes, red, ripe, canned, packed in tomato juice',
            'Tomatoes, sun-dried',
            'Tomatoes, crushed, canned',
            'Tomato powder',
            'Tomato products, canned, paste',
        ],
    },
    {
        noun: 'milk',
        owner: 'Milk, whole, 3.25% milkfat, with added vitamin D',
        candidates: [
            'Milk, whole, 3.25% milkfat, with added vitamin D',
            'Milk, canned, condensed, sweetened',
            'Milk, dry, nonfat, calcium reduced',
            'Milk, buttermilk, fluid, whole',
            'Milk, sheep, fluid',
            'Milk, imitation, non-soy',
        ],
    },
    {
        noun: 'onions',
        owner: 'Onions, raw',
        candidates: [
            'Onions, raw',
            'Onions, dehydrated flakes',
            'Onions, frozen, chopped, unprepared',
            'Onions, canned, solids and liquids',
            'Onions, welsh, raw',
            'Onions, spring or scallions (includes tops and bulb), raw',
        ],
    },
    {
        noun: 'beans',
        owner: 'Beans, snap, green, raw',
        candidates: [
            'Beans, snap, green, raw',
            'Beans, snap, green, canned, regular pack, drained solids',
            'Beans, kidney, red, mature seeds, canned',
            'Beans, baked, canned, with pork and tomato sauce',
            'Beans, black, mature seeds, raw',
            'Beans, pinto, mature seeds, raw',
        ],
    },
    {
        noun: 'potatoes',
        owner: 'Potatoes, flesh and skin, raw',
        candidates: [
            'Potatoes, flesh and skin, raw',
            'Potatoes, boiled, cooked in skin, flesh, without salt',
            'Potatoes, french fried, all types, frozen, unprepared',
            'Potatoes, mashed, home-prepared, whole milk and butter added',
            'Potatoes, canned, drained solids',
            'Potato flour',
        ],
    },
    {
        noun: 'carrots',
        owner: 'Carrots, raw',
        candidates: [
            'Carrots, raw',
            'Carrots, canned, regular pack, drained solids',
            'Carrots, frozen, unprepared',
            'Carrots, cooked, boiled, drained, without salt',
            'Carrot juice, canned',
            'Carrot, dehydrated',
        ],
    },
    {
        noun: 'spinach',
        owner: 'Spinach, raw',
        candidates: [
            'Spinach, raw',
            'Spinach, cooked, boiled, drained, without salt',
            'Spinach, canned, regular pack, drained solids',
            'Spinach, frozen, chopped or leaf, unprepared',
            'Spinach souffle',
            'Spinach, baby',
        ],
    },
    {
        noun: 'chicken',
        owner: 'Chicken, broilers or fryers, breast, meat only, raw',
        candidates: [
            'Chicken, broilers or fryers, breast, meat only, raw',
            'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
            'Chicken, canned, no broth',
            'Chicken, ground, raw',
            'Chicken spread',
            'Chicken, broilers or fryers, meat and skin, raw',
        ],
    },
];

const SYSTEM =
    'You decide which of several foods a plain ingredient word refers to.\n' +
    'The user typed a bare word with no qualifier, so they mean the plain, ' +
    'basic, unprepared version of that food.\n' +
    'Canned, frozen, dried, cooked, powdered, juiced, mashed or prepared ' +
    'versions are NOT what a bare word means.\n' +
    'Reply with ONLY the number of the best match.';

async function arbitrate(noun, candidates) {
    const list = candidates.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const started = performance.now();

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            ...(noThink ? { think: false } : {}),
            options: { temperature: 0, num_predict: 24, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM },
                {
                    role: 'user',
                    content: `The word "${noun}" refers to which of these?\n\n${list}\n\nNumber:`,
                },
            ],
        }),
    });

    const ms = Math.round(performance.now() - started);
    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    const match = raw.match(/\d+/);
    const index = match ? Number(match[0]) - 1 : -1;

    return { ms, raw, pick: candidates[index] ?? null, index };
}

// Shuffle deterministically per case so the correct answer is not always first
// and not always in the same slot - otherwise position bias would look like
// accuracy.
function rotate(list, by) {
    const n = list.length;
    const k = ((by % n) + n) % n;
    return [...list.slice(k), ...list.slice(0, k)];
}

let correct = 0;
let parseable = 0;
let totalMs = 0;
const rows = [];

for (let i = 0; i < CASES.length; i++) {
    const testCase = CASES[i];
    const shuffled = rotate(testCase.candidates, i + 2);
    const result = await arbitrate(testCase.noun, shuffled);

    totalMs += result.ms;
    if (result.pick) parseable++;
    const ok = result.pick === testCase.owner;
    if (ok) correct++;

    const ownerSlot = shuffled.indexOf(testCase.owner) + 1;
    rows.push(
        `${ok ? 'OK  ' : 'MISS'} "${testCase.noun}" (correct at slot ${ownerSlot}) -> ` +
            `${result.pick ?? `unparsed ${JSON.stringify(result.raw)}`}`,
    );
}

console.log(rows.join('\n'));
console.log(
    `\n=== ${model}: parseable ${parseable}/${CASES.length}, correct ${correct}/${CASES.length}, ` +
        `avg ${Math.round(totalMs / CASES.length)}ms ===`,
);

// Position-bias check: same question, reversed order. If the model answers the
// same FOOD both times it is reading; if it answers the same SLOT it is not.
const probe = CASES[0];
const forward = await arbitrate(probe.noun, probe.candidates);
const reversed = await arbitrate(probe.noun, [...probe.candidates].reverse());
console.log(
    `\nposition test: forward -> slot ${forward.index + 1} (${forward.pick})` +
        `\n               reversed -> slot ${reversed.index + 1} (${reversed.pick})` +
        `\n               => ${forward.pick === reversed.pick ? 'STABLE (same food)' : 'ORDER-DEPENDENT'}`,
);

// Rotation test: same list rotated. A stable model keeps the same food.
const rotated = await arbitrate(probe.noun, rotate(probe.candidates, 3));
console.log(
    `               rotated -> slot ${rotated.index + 1} (${rotated.pick})` +
        `\n               => ${forward.pick === rotated.pick ? 'STABLE across rotation' : 'MOVED with position'}`,
);
