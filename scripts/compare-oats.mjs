// Compares the Brotherk API's food lookup with its meal generation for the same food.
// Run: node --env-file=.env scripts/compare-oats.mjs
// Calls only the Brotherk API (never our own server). Generation calls are paid; this makes two.
const BASE = (
    process.env.MEALMAKER_API_URL ?? 'https://mealmaker.brotherk3d.com/api/v1'
).replace(/\/+$/, '');
const KEY = process.env.MEALMAKER_API_KEY;
if (!KEY) {
    console.error('MEALMAKER_API_KEY is not set.');
    process.exit(1);
}

// label, USDA nutrient number (lookup detail), key in generation's micronutrientsPer100g
const NUTRIENTS = [
    ['Iron', '303', 'iron'],
    ['Calcium', '301', 'calcium'],
    ['Magnesium', '304', 'magnesium'],
    ['Zinc', '309', 'zinc'],
    ['Selenium', '317', 'selenium'],
    ['Folate (DFE)', '435', 'folate'],
    ['Vitamin C', '401', 'vitaminC'],
    ['Vitamin B12', '418', 'vitaminB12'],
    ['Choline', '421', 'choline'],
    ['Iodine', '314', 'iodine'],
];

async function api(path, body) {
    const response = await fetch(`${BASE}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90_000),
    });
    const json = await response.json();
    if (!response.ok)
        throw new Error(`${path}: ${json.error?.code ?? response.status}`);
    return json;
}

const show = (value) => (value === undefined || value === null ? '-' : value);

console.log(`Server: ${BASE}\n`);

// 1. Lookup: POST /foods/resolve, then GET /foods/{fdcId}
let started = performance.now();
const { results } = await api('/foods/resolve', { terms: ['rolled oats'] });
const food = results[0].food;
const detail = await api(`/foods/${food.fdcId}`);
const lookupSeconds = ((performance.now() - started) / 1000).toFixed(1);
const byNumber = new Map(detail.nutrientsPer100g.map((n) => [n.nbr, n]));

console.log(`LOOKUP "rolled oats" (${lookupSeconds}s)`);
console.log(
    `  matched: ${food.fdcId} ${food.description} [${food.match.tier}]`,
);
console.log(
    `  macros per 100 g: ${food.per100g.kcal} kcal, protein ${food.per100g.proteinG} g, carbs ${food.per100g.carbsG} g, fat ${food.per100g.fatG} g`,
);

// 2. Generation: POST /meals/generate, once with each name
async function generate(name) {
    started = performance.now();
    const meal = await api('/meals/generate', {
        ingredients: [{ name }, { name: 'kale' }],
        requirements: { calories: 500 },
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const entry = meal.ingredients.find((i) =>
        i.name.toLowerCase().includes('oat'),
    );
    return { name, seconds, meal, entry };
}

const generated = [await generate('rolled oats'), await generate('oats')];

for (const { name, seconds, meal, entry } of generated) {
    console.log(`\nGENERATE with "${name}" + kale (${seconds}s)`);
    if (!entry) {
        console.log('  no oats entry returned');
        continue;
    }
    console.log(
        `  oats entry: "${entry.name}", ${entry.weight} g, source: ${entry.nutritionSource}, USDA id: ${entry.usda?.fdcId ?? '-'}`,
    );
    console.log(
        `  estimated by the API: ${meal.estimatedIngredients?.includes(name) ? 'YES' : 'no'}`,
    );
    console.log(
        `  macros per 100 g: ${entry.caloriesPer100g} kcal, protein ${entry.proteinPer100g} g, carbs ${entry.carbohydratePer100g} g, fat ${entry.fatPer100g} g`,
    );
    console.log(
        `  micronutrient block: ${entry.micronutrientsPer100g ? `${Object.keys(entry.micronutrientsPer100g).length} keys` : 'MISSING'}`,
    );
}

// 3. Side by side
const columns = generated.map(({ name }) => `generate "${name}"`);
console.log(`\nMICRONUTRIENTS per 100 g`);
console.log(
    ['nutrient'.padEnd(14), 'lookup'.padEnd(10), ...columns.map((c) => c.padEnd(22))].join(''),
);
for (const [label, number, key] of NUTRIENTS) {
    const looked = byNumber.get(number);
    const lookup = looked
        ? `${looked.amount} ${looked.unit.toLowerCase()}`
        : undefined;
    console.log(
        [
            label.padEnd(14),
            String(show(lookup)).padEnd(10),
            ...generated.map(({ entry }) =>
                String(show(entry?.micronutrientsPer100g?.[key])).padEnd(22),
            ),
        ].join(''),
    );
}
