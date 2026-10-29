// Tests prompt variants for bare-noun arbitration, including a variant that
// states the rule as a test instead of a preference.
//
// Baseline prompt scored 5/8. The misses were all "picked another plain food"
// (buttermilk for milk, pinto beans for beans, dark chicken meat for chicken),
// which suggests the model needs the qualifier list made explicit and a
// tie-break rule for when several candidates are arguably plain.
//
// Usage: node db/ui/bench-noun-prompts.mjs <model> [--no-think]
const OLLAMA = 'http://localhost:11434';

const model = process.argv[2] ?? 'gemma4:12b';
const noThink = process.argv.includes('--no-think');

const CASES = [
    {
        noun: 'tomatoes',
        owner: 'Tomatoes, red, ripe, raw, year round average',
        candidates: [
            'Tomatoes, red, ripe, raw, year round average',
            'Tomatoes, red, ripe, canned, packed in tomato juice',
            'Tomatoes, sun-dried', 'Tomatoes, crushed, canned',
            'Tomato powder', 'Tomato products, canned, paste',
        ],
    },
    {
        noun: 'milk',
        owner: 'Milk, whole, 3.25% milkfat, with added vitamin D',
        candidates: [
            'Milk, whole, 3.25% milkfat, with added vitamin D',
            'Milk, canned, condensed, sweetened', 'Milk, dry, nonfat, calcium reduced',
            'Milk, buttermilk, fluid, whole', 'Milk, sheep, fluid', 'Milk, imitation, non-soy',
        ],
    },
    {
        noun: 'onions',
        owner: 'Onions, raw',
        candidates: [
            'Onions, raw', 'Onions, dehydrated flakes',
            'Onions, frozen, chopped, unprepared', 'Onions, canned, solids and liquids',
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
            'Beans, black, mature seeds, raw', 'Beans, pinto, mature seeds, raw',
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
            'Potatoes, canned, drained solids', 'Potato flour',
        ],
    },
    {
        noun: 'carrots',
        owner: 'Carrots, raw',
        candidates: [
            'Carrots, raw', 'Carrots, canned, regular pack, drained solids',
            'Carrots, frozen, unprepared',
            'Carrots, cooked, boiled, drained, without salt',
            'Carrot juice, canned', 'Carrot, dehydrated',
        ],
    },
    {
        noun: 'spinach',
        owner: 'Spinach, raw',
        candidates: [
            'Spinach, raw', 'Spinach, cooked, boiled, drained, without salt',
            'Spinach, canned, regular pack, drained solids',
            'Spinach, frozen, chopped or leaf, unprepared', 'Spinach souffle', 'Spinach, baby',
        ],
    },
    {
        noun: 'chicken',
        owner: 'Chicken, broilers or fryers, breast, meat only, raw',
        candidates: [
            'Chicken, broilers or fryers, breast, meat only, raw',
            'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
            'Chicken, canned, no broth', 'Chicken, ground, raw', 'Chicken spread',
            'Chicken, broilers or fryers, meat and skin, raw',
        ],
    },
];

const PROMPTS = [
    {
        name: 'A: preference (baseline)',
        system:
            'You decide which of several foods a plain ingredient word refers to.\n' +
            'The user typed a bare word with no qualifier, so they mean the plain, ' +
            'basic, unprepared version of that food.\n' +
            'Canned, frozen, dried, cooked, powdered, juiced, mashed or prepared ' +
            'versions are NOT what a bare word means.\n' +
            'Reply with ONLY the number of the best match.',
    },
    {
        name: 'B: explicit rejection test',
        system:
            'You pick ONE numbered option.\n' +
            'Rule: reject any option whose description contains canned, frozen, ' +
            'dried, dehydrated, powdered, juice, mashed, cooked, boiled, fried, ' +
            'baked, roasted, spread, condensed, or sweetened.\n' +
            'From what remains, pick the most ordinary everyday version.\n' +
            'Reply with ONLY the number.',
    },
    {
        name: 'C: reject-then-tiebreak',
        system:
            'You pick ONE numbered option for a bare ingredient word.\n' +
            'Step 1: eliminate options containing canned, frozen, dried, ' +
            'dehydrated, powdered, juice, mashed, cooked, boiled, fried, baked, ' +
            'roasted, spread, condensed, sweetened, buttermilk, or a specific ' +
            'breed or cut.\n' +
            'Step 2: of those remaining, pick the one a shopper would grab by ' +
            'default - the plainest, most generic option.\n' +
            'Reply with ONLY the number.',
    },
    {
        name: 'D: few-shot',
        system:
            'You pick ONE numbered option for a bare ingredient word.\n' +
            'Example: "apples"\n' +
            '1. Apples, dried, sulfured, uncooked\n' +
            '2. Apples, raw, with skin\n' +
            '3. Applesauce, canned, unsweetened\n' +
            'Answer: 2\n\n' +
            'Reply with ONLY the number.',
    },
];

function rotate(list, by) {
    const n = list.length;
    const k = ((by % n) + n) % n;
    return [...list.slice(k), ...list.slice(0, k)];
}

async function run(system) {
    let correct = 0;
    const misses = [];

    for (let i = 0; i < CASES.length; i++) {
        const testCase = CASES[i];
        const shuffled = rotate(testCase.candidates, i + 2);
        const list = shuffled.map((c, j) => `${j + 1}. ${c}`).join('\n');

        const response = await fetch(`${OLLAMA}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                stream: false,
                keep_alive: '10m',
                ...(noThink ? { think: false } : {}),
                options: { temperature: 0, num_predict: 20, num_ctx: 2048 },
                messages: [
                    { role: 'system', content: system },
                    {
                        role: 'user',
                        content: `The word "${testCase.noun}" refers to which?\n\n${list}\n\nNumber:`,
                    },
                ],
            }),
        });

        const data = await response.json();
        const raw = (data.message?.content ?? '').trim();
        const match = raw.match(/\d+/);
        const pick = match ? shuffled[Number(match[0]) - 1] : null;
        if (pick === testCase.owner) correct++;
        else misses.push(`${testCase.noun} -> ${pick ?? JSON.stringify(raw)}`);
    }

    return { correct, misses };
}

for (const prompt of PROMPTS) {
    const { correct, misses } = await run(prompt.system);
    console.log(`\n${prompt.name}: ${correct}/${CASES.length}`);
    if (misses.length) console.log(`  misses: ${misses.join(' | ')}`);
}
