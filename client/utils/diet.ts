import type { DietaryPreference } from '../../shared/types/types';

type FoodGroup = 'meat' | 'fish' | 'dairy' | 'egg' | 'honey' | 'gluten';

// Whole-word keywords; plurals are handled by the matcher.
const GROUP_KEYWORDS: Record<FoodGroup, string[]> = {
    meat: [
        'beef',
        'steak',
        'pork',
        'bacon',
        'ham',
        'lamb',
        'mutton',
        'veal',
        'venison',
        'sausage',
        'salami',
        'pepperoni',
        'chorizo',
        'prosciutto',
        'mince',
        'burger',
        'meatball',
        'chicken',
        'turkey',
        'duck',
        'goose',
        'gelatin',
        'gelatine',
        'meat',
        'liver',
        'jerky',
        'pancetta',
    ],
    fish: [
        'fish',
        'salmon',
        'tuna',
        'cod',
        'haddock',
        'trout',
        'sardine',
        'anchovy',
        'anchovies',
        'mackerel',
        'tilapia',
        'halibut',
        'prawn',
        'shrimp',
        'crab',
        'lobster',
        'scallop',
        'mussel',
        'clam',
        'oyster',
        'squid',
        'calamari',
        'octopus',
        'seafood',
        'sea bass',
    ],
    dairy: [
        'milk',
        'cheese',
        'cheddar',
        'mozzarella',
        'parmesan',
        'feta',
        'halloumi',
        'ricotta',
        'butter',
        'buttermilk',
        'cream',
        'yogurt',
        'yoghurt',
        'ghee',
        'whey',
        'paneer',
        'custard',
        'mascarpone',
        'brie',
        'quark',
        'kefir',
        'skyr',
        'cottage cheese',
        'cream cheese',
    ],
    egg: ['egg', 'eggs', 'mayonnaise', 'mayo', 'meringue'],
    honey: ['honey'],
    gluten: [
        'wheat',
        'flour',
        'bread',
        'pasta',
        'spaghetti',
        'penne',
        'noodle',
        'couscous',
        'barley',
        'rye',
        'semolina',
        'bulgur',
        'seitan',
        'oats',
        'oat',
        'porridge',
        'cracker',
        'tortilla',
        'breadcrumbs',
        'bagel',
        'croissant',
        'pita',
        'naan',
        'soy sauce',
        'beer',
        'farro',
        'spelt',
    ],
};

// Plant-based or naturally free versions that would otherwise match.
const GROUP_EXCEPTIONS: Partial<Record<FoodGroup, string[]>> = {
    meat: ['plant-based', 'vegan', 'meatless', 'mock', 'soy mince', 'quorn'],
    dairy: [
        'almond milk',
        'oat milk',
        'soy milk',
        'soya milk',
        'rice milk',
        'coconut milk',
        'coconut cream',
        'cashew milk',
        'peanut butter',
        'almond butter',
        'cashew butter',
        'cocoa butter',
        'nut butter',
        'vegan',
        'plant-based',
        'dairy-free',
        'cream of tartar',
    ],
    egg: ['vegan mayo', 'vegan mayonnaise', 'egg-free', 'eggless'],
    gluten: [
        'gluten-free',
        'rice flour',
        'almond flour',
        'coconut flour',
        'chickpea flour',
        'gram flour',
        'corn flour',
        'cornflour',
        'buckwheat',
        'rice noodle',
        'rice noodles',
        'corn tortilla',
        'tamari',
        'gluten free',
    ],
};

const DIET_EXCLUDES: Record<DietaryPreference, FoodGroup[]> = {
    vegetarian: ['meat', 'fish'],
    vegan: ['meat', 'fish', 'dairy', 'egg', 'honey'],
    'dairy-free': ['dairy'],
    'gluten-free': ['gluten'],
};

const DIET_STORAGE_KEY = 'mealmaker-diet';
const ALL_DIETS = Object.keys(DIET_EXCLUDES) as DietaryPreference[];

/* The diet is a standing preference, so it's remembered per browser. */
export function loadDietPreference(): DietaryPreference[] {
    try {
        const stored: unknown = JSON.parse(
            localStorage.getItem(DIET_STORAGE_KEY) ?? '[]',
        );

        return Array.isArray(stored)
            ? stored.filter((diet): diet is DietaryPreference =>
                  ALL_DIETS.includes(diet),
              )
            : [];
    } catch {
        return [];
    }
}

export function saveDietPreference(dietary: DietaryPreference[]) {
    try {
        localStorage.setItem(DIET_STORAGE_KEY, JSON.stringify(dietary));
    } catch {
        // Storage unavailable (private mode); the choice lasts this visit.
    }
}

export const DIET_LABELS: Record<DietaryPreference, string> = {
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    'dairy-free': 'Dairy-free',
    'gluten-free': 'Gluten-free',
};

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(name: string, phrase: string) {
    return new RegExp(`\\b${escapeRegExp(phrase)}(e?s)?\\b`).test(name);
}

function isInGroup(name: string, group: FoodGroup) {
    const normalized = name.toLowerCase();
    const exceptions = GROUP_EXCEPTIONS[group] ?? [];

    if (exceptions.some((phrase) => normalized.includes(phrase))) {
        return false;
    }

    return GROUP_KEYWORDS[group].some((keyword) =>
        mentions(normalized, keyword),
    );
}

/* The chosen diets an ingredient (by name) doesn't fit. Keyword based, so
   it errs towards recognising common foods rather than every product. */
export function getDietConflicts(
    name: string,
    dietary: DietaryPreference[],
): DietaryPreference[] {
    return dietary.filter((diet) =>
        DIET_EXCLUDES[diet].some((group) => isInGroup(name, group)),
    );
}

/* "Not vegan", "Not vegetarian or gluten-free" */
export function describeDietConflicts(conflicts: DietaryPreference[]) {
    const labels = conflicts.map((diet) => DIET_LABELS[diet].toLowerCase());

    return `Not ${labels.join(' or ')}`;
}
