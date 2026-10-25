/*
 * Preparation and food-safety knowledge: anti-nutrients (lectins,
 * oxalates, phytates, goitrogens, cyanogenic glycosides, ...), toxins and
 * safe cooking temperatures. Matched against ingredient names so every
 * meal shows the same, reviewed advice instead of whatever the model
 * happens to mention, and so the model can be told to build the steps in.
 */

export type PrepSeverity = 'required' | 'recommended' | 'tip';

export type PrepCompound =
    | 'lectins'
    | 'oxalates'
    | 'phytates'
    | 'goitrogens'
    | 'cyanogenic glycosides'
    | 'solanine'
    | 'saponins'
    | 'enzyme inhibitors'
    | 'avidin'
    | 'tannins'
    | 'arsenic'
    | 'food safety'
    | 'absorption';

type PrepGuidance = {
    id: string;
    title: string;
    severity: PrepSeverity;
    compounds: PrepCompound[];
    // Lower-case words or phrases matched at word starts (plurals allowed).
    keywords: string[];
    // Skip the entry when the ingredient name mentions any of these.
    exclude?: string[];
    // Only match when the name also mentions one of these.
    requiresAny?: string[];
    summary: string;
    steps: string[];
};

/* A guidance entry matched to the ingredients it applies to. */
export type PrepConsideration = Omit<
    PrepGuidance,
    'keywords' | 'exclude' | 'requiresAny'
> & {
    ingredients: string[];
};

const PRE_COOKED = ['canned', 'tinned', 'cooked', 'jarred'];

export const PREP_GUIDANCE: PrepGuidance[] = [
    {
        id: 'kidney-beans',
        title: 'Kidney beans must be boiled hard',
        severity: 'required',
        compounds: ['lectins'],
        keywords: ['kidney bean', 'red bean', 'cannellini', 'white kidney'],
        exclude: PRE_COOKED,
        summary:
            'Raw or undercooked kidney beans contain phytohaemagglutinin, a lectin that causes severe vomiting — a handful of undercooked beans is enough. Low slow-cooker temperatures can make it worse.',
        steps: [
            'Soak dried beans for 8–12 hours, then discard the soaking water.',
            'Boil hard in fresh water for at least 10 minutes, then simmer until completely soft (about 1 hour in total).',
            'Never cook dried kidney beans from raw in a slow cooker; boil them first. Canned beans are already cooked.',
        ],
    },
    {
        id: 'dried-legumes',
        title: 'Soak and fully cook dried beans',
        severity: 'recommended',
        compounds: ['lectins', 'phytates', 'enzyme inhibitors'],
        keywords: [
            'bean',
            'black bean',
            'pinto',
            'navy bean',
            'haricot',
            'lima bean',
            'butter bean',
            'borlotti',
            'chickpea',
            'garbanzo',
            'adzuki',
            'mung bean',
            'black-eyed pea',
            'soybean',
            'soy bean',
            'edamame',
        ],
        exclude: [
            ...PRE_COOKED,
            'kidney',
            'cannellini',
            'red bean',
            'green bean',
            'string bean',
            'runner bean',
            'french bean',
            'coffee',
            'vanilla',
            'cocoa',
            'jelly',
            'sprout',
            'baked bean',
            'paste',
            'sauce',
        ],
        summary:
            'Dried legumes carry lectins, phytates and enzyme (trypsin) inhibitors. Soaking and thorough cooking neutralise the lectins and inhibitors and cut phytates, which otherwise reduce iron and zinc absorption.',
        steps: [
            'Soak dried beans or chickpeas 8–12 hours and discard the water (a pinch of baking soda speeds softening).',
            'Boil in fresh water until fully soft — never eat them firm or raw. A pressure cooker is the most effective.',
            'Edamame and fresh soybeans: boil or steam 4–5 minutes before eating.',
            'Add vitamin C (lemon, tomato, peppers) to the dish to improve iron absorption.',
        ],
    },
    {
        id: 'canned-legumes',
        title: 'Rinse canned beans',
        severity: 'tip',
        compounds: ['absorption'],
        keywords: ['bean', 'chickpea', 'garbanzo', 'lentil'],
        requiresAny: ['canned', 'tinned'],
        exclude: ['green bean'],
        summary:
            'Canned legumes are already cooked, so their lectins are deactivated. Draining and rinsing removes much of the added salt.',
        steps: ['Drain and rinse under cold water before using.'],
    },
    {
        id: 'lentils',
        title: 'Cook lentils and split peas thoroughly',
        severity: 'recommended',
        compounds: ['lectins', 'phytates'],
        keywords: ['lentil', 'split pea', 'dal', 'dhal'],
        exclude: PRE_COOKED,
        summary:
            'Lentils contain lectins and phytates. They don’t need soaking, but must be cooked until soft; a short soak lowers phytates further.',
        steps: [
            'Rinse and pick over, then simmer until fully soft (red 15–20 min, green/brown 25–30 min).',
            'Optional: soak 2–4 hours and discard the water to reduce phytates.',
            'Pair with vitamin C to boost iron absorption.',
        ],
    },
    {
        id: 'green-beans',
        title: 'Cook green beans',
        severity: 'recommended',
        compounds: ['lectins'],
        keywords: ['green bean', 'string bean', 'runner bean', 'french bean'],
        summary:
            'Raw green beans contain lectins that can upset digestion in larger amounts; brief cooking deactivates them.',
        steps: ['Boil or steam for 4–6 minutes until tender-crisp.'],
    },
    {
        id: 'oxalate-greens',
        title: 'Blanch high-oxalate greens',
        severity: 'recommended',
        compounds: ['oxalates', 'absorption'],
        keywords: [
            'spinach',
            'swiss chard',
            'chard',
            'beet green',
            'beetroot green',
            'beet leaves',
            'amaranth leaves',
            'sorrel',
            'purslane',
        ],
        summary:
            'Very high in soluble oxalates, which bind calcium and iron (so little of either is absorbed) and can contribute to kidney stones in people prone to them. Boiling and discarding the water removes roughly 30–90% of soluble oxalate; steaming removes much less.',
        steps: [
            'Blanch in boiling water for 1–3 minutes, then drain and discard the water.',
            'Squeeze out excess water before adding to the dish.',
            'Serve with a calcium source (yoghurt, cheese, calcium-set tofu) to bind remaining oxalate in the gut.',
            'Add lemon or another vitamin C source to improve iron absorption.',
        ],
    },
    {
        id: 'rhubarb',
        title: 'Use rhubarb stalks only',
        severity: 'required',
        compounds: ['oxalates'],
        keywords: ['rhubarb'],
        summary:
            'Rhubarb leaves contain toxic levels of oxalic acid and must never be eaten. The stalks are also high in oxalates.',
        steps: [
            'Cut off and discard every part of the leaves.',
            'Cook the stalks (stew or bake); pair with dairy such as yoghurt or custard.',
        ],
    },
    {
        id: 'oxalate-moderate',
        title: 'Moderately high in oxalates',
        severity: 'tip',
        compounds: ['oxalates'],
        keywords: [
            'beet',
            'beetroot',
            'almond',
            'cashew',
            'okra',
            'sweet potato',
            'cocoa',
            'cacao',
            'dark chocolate',
            'buckwheat',
            'peanut',
        ],
        exclude: ['beet green', 'beetroot green', 'beet leaves'],
        summary:
            'Fine for most people, but worth moderating if you’re prone to calcium-oxalate kidney stones.',
        steps: [
            'Boil beets and sweet potatoes (and discard the water) rather than roasting to lower oxalates.',
            'Include a calcium-rich food in the same meal.',
        ],
    },
    {
        id: 'cassava',
        title: 'Cassava must be peeled and fully cooked',
        severity: 'required',
        compounds: ['cyanogenic glycosides'],
        keywords: ['cassava', 'yuca', 'manioc'],
        exclude: ['flour', 'tapioca'],
        summary:
            'Raw cassava contains cyanogenic glycosides that release cyanide. Peeling, soaking and boiling remove them; bitter varieties need the most care.',
        steps: [
            'Peel completely, including the pink inner layer, and remove the woody core.',
            'Soak the pieces in water for several hours, discarding the water.',
            'Boil in fresh water until very soft and discard the cooking water. Never eat it raw.',
        ],
    },
    {
        id: 'bamboo-shoots',
        title: 'Boil fresh bamboo shoots',
        severity: 'required',
        compounds: ['cyanogenic glycosides'],
        keywords: ['bamboo shoot'],
        exclude: PRE_COOKED,
        summary:
            'Fresh bamboo shoots contain cyanogenic glycosides; canned shoots are already processed.',
        steps: [
            'Peel, slice and boil for at least 20 minutes, discarding the water.',
        ],
    },
    {
        id: 'elderberries',
        title: 'Cook elderberries; avoid stems and leaves',
        severity: 'required',
        compounds: ['cyanogenic glycosides'],
        keywords: ['elderberry', 'elderberries'],
        summary:
            'Raw elderberries, stems and leaves contain cyanogenic glycosides that cause nausea and vomiting.',
        steps: [
            'Remove all stems, then cook the berries thoroughly (simmer at least 15 minutes).',
        ],
    },
    {
        id: 'potatoes',
        title: 'Remove green parts and sprouts from potatoes',
        severity: 'recommended',
        compounds: ['solanine'],
        keywords: ['potato'],
        exclude: ['sweet potato'],
        summary:
            'Green skin, “eyes” and sprouts contain solanine and chaconine, which cooking doesn’t destroy.',
        steps: [
            'Cut away any green areas and sprouts; discard potatoes that are very green or taste bitter.',
            'Store potatoes somewhere cool and dark.',
            'Avoid over-browning when frying or roasting (it forms acrylamide); aim for golden.',
        ],
    },
    {
        id: 'cruciferous',
        title: 'Cooking reduces goitrogens in brassicas',
        severity: 'tip',
        compounds: ['goitrogens'],
        keywords: [
            'kale',
            'broccoli',
            'cabbage',
            'cauliflower',
            'brussels sprout',
            'bok choy',
            'pak choi',
            'collard',
            'turnip',
            'rutabaga',
            'swede',
            'watercress',
            'mustard green',
        ],
        summary:
            'Brassicas contain glucosinolates that can act as goitrogens. That only matters in large raw amounts for people with low iodine intake or thyroid conditions.',
        steps: [
            'Lightly steam (3–5 minutes) to reduce goitrogens while keeping more vitamin C and sulforaphane than boiling.',
            'For maximum sulforaphane, chop and rest broccoli 30–40 minutes before cooking.',
        ],
    },
    {
        id: 'whole-grains',
        title: 'Soak or ferment whole grains',
        severity: 'tip',
        compounds: ['phytates'],
        keywords: [
            'oat',
            'oatmeal',
            'brown rice',
            'whole wheat',
            'wholemeal',
            'wheat berr',
            'barley',
            'rye',
            'spelt',
            'bulgur',
            'farro',
            'millet',
            'sorghum',
            'bran',
        ],
        exclude: ['oat milk'],
        summary:
            'Phytates in whole grains bind iron, zinc and calcium. Soaking, sprouting or fermenting (sourdough) breaks them down.',
        steps: [
            'Soak oats overnight (overnight oats) or grains for 8–12 hours before cooking.',
            'Prefer sourdough or sprouted-grain breads.',
        ],
    },
    {
        id: 'rice',
        title: 'Rinse rice and cook in plenty of water',
        severity: 'tip',
        compounds: ['arsenic', 'food safety'],
        keywords: ['rice'],
        exclude: ['rice vinegar', 'rice milk', 'rice paper', 'rice noodle'],
        summary:
            'Rice absorbs inorganic arsenic (brown rice more than white). Cooked rice left warm can grow Bacillus cereus.',
        steps: [
            'Rinse until the water runs clear.',
            'Cook in about 6 parts water to 1 part rice and drain the excess — this removes roughly 40–60% of arsenic.',
            'Cool leftovers quickly and refrigerate within 1 hour; reheat until steaming hot only once.',
        ],
    },
    {
        id: 'quinoa',
        title: 'Rinse quinoa',
        severity: 'recommended',
        compounds: ['saponins'],
        keywords: ['quinoa'],
        summary:
            'Quinoa is coated in bitter saponins that can irritate the gut unless rinsed off (some brands pre-rinse).',
        steps: [
            'Rinse in a fine sieve under running water for 1–2 minutes, rubbing the grains.',
        ],
    },
    {
        id: 'nuts-seeds',
        title: 'Nuts and seeds',
        severity: 'tip',
        compounds: ['phytates', 'absorption'],
        keywords: [
            'walnut',
            'hazelnut',
            'pecan',
            'pistachio',
            'sesame',
            'pumpkin seed',
            'sunflower seed',
            'chia',
            'flax',
            'linseed',
            'hemp seed',
        ],
        summary:
            'Nuts and seeds are rich in phytates. Soaking or toasting reduces them slightly.',
        steps: [
            'Grind flaxseed — whole seeds pass through undigested.',
            'Soak chia seeds in liquid before eating; dry chia swells and can be a choking risk.',
        ],
    },
    {
        id: 'eggs',
        title: 'Cook eggs until set',
        severity: 'recommended',
        compounds: ['avidin', 'food safety'],
        keywords: ['egg'],
        exclude: ['eggplant', 'egg noodle', 'egg-free'],
        summary:
            'Raw egg white contains avidin, which blocks biotin absorption, and raw eggs can carry Salmonella.',
        steps: [
            'Cook until whites and yolks are firm (71 °C / 160 °F for dishes containing egg).',
            'Use pasteurised eggs for anything served raw or lightly cooked.',
        ],
    },
    {
        id: 'poultry',
        title: 'Cook poultry to 74 °C',
        severity: 'required',
        compounds: ['food safety'],
        keywords: ['chicken', 'turkey', 'duck', 'poultry'],
        exclude: ['stock', 'broth', 'bouillon'],
        summary:
            'Poultry often carries Salmonella and Campylobacter, which are only killed by thorough cooking.',
        steps: [
            'Cook until the thickest part reaches 74 °C / 165 °F and juices run clear.',
            'Don’t wash raw poultry — it spreads bacteria around the sink. Use a separate board.',
        ],
    },
    {
        id: 'ground-meat',
        title: 'Cook minced meat all the way through',
        severity: 'required',
        compounds: ['food safety'],
        keywords: [
            'mince',
            'minced',
            'ground beef',
            'ground pork',
            'ground lamb',
            'ground turkey',
            'ground chicken',
            'burger',
            'meatball',
        ],
        summary:
            'Mincing spreads surface bacteria (such as E. coli) through the meat, so it needs cooking right through.',
        steps: ['Cook to 71 °C / 160 °F with no pink remaining in the centre.'],
    },
    {
        id: 'pork',
        title: 'Cook pork to 63 °C and rest',
        severity: 'recommended',
        compounds: ['food safety'],
        keywords: ['pork', 'gammon', 'ham steak'],
        exclude: ['ground pork', 'mince'],
        summary: 'Whole cuts of pork are safe once properly cooked and rested.',
        steps: [
            'Cook to 63 °C / 145 °F in the centre, then rest for 3 minutes.',
        ],
    },
    {
        id: 'fish',
        title: 'Cook fish until it flakes',
        severity: 'recommended',
        compounds: ['food safety'],
        keywords: [
            'salmon',
            'tuna',
            'cod',
            'fish',
            'tilapia',
            'mackerel',
            'sardine',
            'trout',
            'haddock',
            'shrimp',
            'prawn',
            'scallop',
            'mussel',
            'clam',
        ],
        exclude: ['fish sauce', 'canned', 'tinned', 'smoked'],
        summary:
            'Cooking kills parasites and bacteria. Large predatory fish (swordfish, shark, king mackerel, bigeye tuna) are high in mercury.',
        steps: [
            'Cook to 63 °C / 145 °F, until opaque and it flakes easily; prawns turn pink and opaque.',
            'Only serve fish raw if it’s sold as sushi-grade (previously frozen).',
            'Discard mussels or clams that stay closed after cooking.',
        ],
    },
    {
        id: 'sprouts',
        title: 'Raw sprouts carry a higher bacteria risk',
        severity: 'recommended',
        compounds: ['food safety'],
        keywords: [
            'alfalfa sprout',
            'bean sprout',
            'mung bean sprout',
            'sprouts',
        ],
        exclude: ['brussels'],
        summary:
            'Sprouts grow in warm, humid conditions that also suit E. coli and Salmonella.',
        steps: [
            'Cook sprouts until steaming hot (stir-fry 1–2 minutes), especially for children, pregnant people and older adults.',
        ],
    },
    {
        id: 'mushrooms',
        title: 'Cook mushrooms',
        severity: 'tip',
        compounds: ['food safety'],
        keywords: [
            'mushroom',
            'shiitake',
            'portobello',
            'chestnut mushroom',
            'oyster mushroom',
        ],
        summary:
            'Cooking breaks down agaritine in common mushrooms and prevents the rash raw shiitake can cause, and makes their nutrients easier to absorb.',
        steps: ['Sauté, roast or grill until browned and tender.'],
    },
    {
        id: 'raw-flour',
        title: 'Don’t eat raw flour or dough',
        severity: 'recommended',
        compounds: ['food safety'],
        keywords: ['flour'],
        summary:
            'Flour is a raw ingredient and can carry E. coli until it’s baked or cooked.',
        steps: ['Bake or cook flour-containing mixtures fully before tasting.'],
    },
    {
        id: 'tea-coffee',
        title: 'Have tea or coffee between meals',
        severity: 'tip',
        compounds: ['tannins', 'absorption'],
        keywords: ['tea', 'coffee', 'matcha', 'espresso'],
        exclude: ['teaspoon', 'tea spoon'],
        summary:
            'Tannins and polyphenols can reduce non-haem iron absorption from the meal by up to about 60%.',
        steps: [
            'Drink tea or coffee at least an hour before or after iron-rich meals.',
        ],
    },
    {
        id: 'turmeric',
        title: 'Pair turmeric with black pepper and fat',
        severity: 'tip',
        compounds: ['absorption'],
        keywords: ['turmeric'],
        summary:
            'Curcumin is poorly absorbed alone; piperine in black pepper and a little fat raise its absorption considerably.',
        steps: [
            'Add a pinch of black pepper and cook turmeric briefly in oil.',
        ],
    },
];

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches at a word start, with optional plural endings ("beans", "potatoes").
function mentions(name: string, phrase: string) {
    return new RegExp(`\\b${escapeRegExp(phrase)}(s|es)?\\b`).test(name);
}

function appliesTo(guidance: PrepGuidance, ingredientName: string) {
    const name = ingredientName.toLowerCase();

    if (!guidance.keywords.some((keyword) => mentions(name, keyword))) {
        return false;
    }
    if (guidance.exclude?.some((word) => name.includes(word))) {
        return false;
    }
    if (
        guidance.requiresAny &&
        !guidance.requiresAny.some((word) => name.includes(word))
    ) {
        return false;
    }

    return true;
}

const SEVERITY_ORDER: Record<PrepSeverity, number> = {
    required: 0,
    recommended: 1,
    tip: 2,
};

/* Guidance for the given ingredients, most important first. */
export function getPrepConsiderations(
    ingredientNames: string[],
): PrepConsideration[] {
    const considerations: PrepConsideration[] = [];

    for (const guidance of PREP_GUIDANCE) {
        const ingredients = ingredientNames.filter((name) =>
            appliesTo(guidance, name),
        );

        if (ingredients.length === 0) continue;

        considerations.push({
            id: guidance.id,
            title: guidance.title,
            severity: guidance.severity,
            compounds: guidance.compounds,
            summary: guidance.summary,
            steps: guidance.steps,
            ingredients,
        });
    }

    return considerations.sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
}

/* Plain-text version for the meal prompt. */
export function formatConsiderationsForPrompt(
    considerations: PrepConsideration[],
): string {
    return considerations
        .filter((consideration) => consideration.severity !== 'tip')
        .map(
            (consideration) =>
                `- ${consideration.ingredients.join(', ')} (${consideration.severity === 'required' ? 'REQUIRED' : 'recommended'}; ${consideration.compounds.join(', ')}): ${consideration.steps.join(' ')}`,
        )
        .join('\n');
}
