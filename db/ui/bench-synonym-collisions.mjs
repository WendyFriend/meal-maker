// Tests whether generated synonyms collide across related foods.
//
// The failure the user described: if 'Tomatoes, canned' gets the bare synonym
// 'tomatoes', it competes with (and can beat) 'Tomatoes, red, ripe, raw' for a
// user who typed "tomatoes" meaning the fresh vegetable.
//
// The principle being tested: a food carrying qualifiers (canned, dried,
// frozen, powdered) must NOT claim the bare noun. The bare-noun food owns it.
//
// Usage: node db/ui/bench-synonym-collisions.mjs <model> [--no-think]
const OLLAMA = 'http://localhost:11434';

const model = process.argv[2] ?? 'gemma4:12b';
const noThink = process.argv.includes('--no-think');
if (!model) process.exit(1);

// Groups of related foods. Within each group, only the "owner" may claim the
// bare noun; the variants must keep their qualifier in every synonym.
const GROUPS = [
    {
        bare: 'tomatoes',
        owner: 'Tomatoes, red, ripe, raw, year round average',
        variants: [
            'Tomatoes, red, ripe, canned, packed in tomato juice',
            'Tomatoes, sun-dried',
            'Tomatoes, crushed, canned',
            'Tomato powder',
            'Tomato products, canned, paste',
        ],
    },
    {
        bare: 'milk',
        owner: 'Milk, whole, 3.25% milkfat, with added vitamin D',
        variants: [
            'Milk, canned, condensed, sweetened',
            'Milk, dry, nonfat, calcium reduced',
            'Milk, buttermilk, fluid, whole',
            'Milk, sheep, fluid',
        ],
    },
    {
        bare: 'onions',
        owner: 'Onions, raw',
        variants: [
            'Onions, dehydrated flakes',
            'Onions, frozen, chopped, unprepared',
            'Onions, canned, solids and liquids',
            'Onions, spring or scallions (includes tops and bulb), raw',
        ],
    },
    {
        bare: 'beans',
        owner: 'Beans, snap, green, raw',
        variants: [
            'Beans, snap, green, canned, regular pack, drained solids',
            'Beans, kidney, red, mature seeds, canned',
            'Beans, baked, canned, with pork and tomato sauce',
        ],
    },
];

const SYSTEM =
    'You generate search terms for a recipe app. A user will type these into a ' +
    'search box to find an ingredient.\n' +
    'Give 4 to 8 SHORT terms, each 1 to 4 words, that real people would type.\n' +
    'Include regional and colloquial names when the food has them.\n' +
    'IMPORTANT: keep any qualifier the food has. If the food is canned, dried, ' +
    'frozen, powdered or condensed, every term must say so - never give the ' +
    'bare noun alone.\n' +
    'Reply with ONLY a JSON array of strings.';

async function terms(description) {
    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            ...(noThink ? { think: false } : {}),
            format: {
                type: 'object',
                properties: { terms: { type: 'array', items: { type: 'string' } } },
                required: ['terms'],
            },
            options: { temperature: 0.2, num_predict: 260, num_ctx: 2048 },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `USDA food description: ${description}\n\nTerms:` },
            ],
        }),
    });

    const data = await response.json();
    const raw = (data.message?.content ?? '').trim();
    let list = [];
    try {
        const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) list = parsed;
        else if (Array.isArray(parsed.terms)) list = parsed.terms;
    } catch {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                list = JSON.parse(match[0]);
            } catch {
                list = [];
            }
        }
    }

    return list
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 3 && t.length <= 40);
}

// The check: does any variant claim the bare noun outright?
function claimsBareNoun(termList, bare) {
    const singular = bare.endsWith('s') ? bare.slice(0, -1) : bare;
    return termList.filter((t) => {
        const cleaned = t.replace(/[^a-z ]/g, '').trim();
        return cleaned === bare || cleaned === singular;
    });
}

let collisions = 0;
let totalVariants = 0;

for (const group of GROUPS) {
    console.log(`\n${'='.repeat(70)}\nGROUP: "${group.bare}"\n${'='.repeat(70)}`);

    const ownerTerms = await terms(group.owner);
    const ownerClaims = claimsBareNoun(ownerTerms, group.bare);
    console.log(
        `\nOWNER  ${group.owner.slice(0, 52)}` +
            `\n       ${ownerTerms.join(' | ') || '(none)'}` +
            `\n       claims bare noun: ${ownerClaims.length ? `YES (${ownerClaims.join(', ')})` : 'no'}` +
            `  ${ownerClaims.length ? '' : '<- owner should claim it'}`,
    );

    for (const variant of group.variants) {
        totalVariants++;
        const variantTerms = await terms(variant);
        const bad = claimsBareNoun(variantTerms, group.bare);
        if (bad.length) collisions++;

        console.log(
            `\nVARIANT ${variant.slice(0, 50)}` +
                `\n        ${variantTerms.join(' | ') || '(none)'}` +
                `\n        ${
                    bad.length
                        ? `*** COLLISION: claims bare noun "${bad.join('", "')}" ***`
                        : 'clean - keeps its qualifier'
                }`,
        );
    }
}

console.log(
    `\n\n=== ${model}: ${collisions}/${totalVariants} variants claimed the bare noun ===`,
);
