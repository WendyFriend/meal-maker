import type { UserIngredient } from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';

// The app has saved ingredient records, but no category metadata. These aliases
// only classify existing records. The starter lists below only supply names for
// new users; nutrition is never supplied here and is resolved later.
export const quickAddCategories = [
    { id: 'vegetables', name: 'Vegetables' },
    { id: 'proteins', name: 'Proteins' },
    { id: 'grains', name: 'Grains' },
    { id: 'nuts-seeds', name: 'Nuts & Seeds' },
] as const;

export type QuickAddCategory = (typeof quickAddCategories)[number];
export type QuickAddCategoryId = QuickAddCategory['id'];

const categoryAliases = {
    'nuts-seeds': [
        'almond',
        'almonds',
        'walnut',
        'walnuts',
        'cashew',
        'cashews',
        'peanut',
        'peanuts',
        'pecan',
        'pecans',
        'pistachio',
        'pistachios',
        'hazelnut',
        'hazelnuts',
        'macadamia',
        'macadamias',
        'brazil nuts',
        'pine nuts',
        'seed',
        'seeds',
        'chia',
        'flax',
        'linseed',
        'sesame',
    ],
    vegetables: [
        'broccoli',
        'carrot',
        'carrots',
        'spinach',
        'kale',
        'lettuce',
        'tomato',
        'tomatoes',
        'onion',
        'onions',
        'pepper',
        'peppers',
        'capsicum',
        'zucchini',
        'courgette',
        'cucumber',
        'mushroom',
        'mushrooms',
        'peas',
        'cabbage',
        'cauliflower',
        'pumpkin',
        'potato',
        'potatoes',
        'asparagus',
        'eggplant',
        'aubergine',
        'celery',
        'beetroot',
        'green beans',
    ],
    proteins: [
        'chicken',
        'turkey',
        'beef',
        'pork',
        'lamb',
        'salmon',
        'tuna',
        'fish',
        'prawn',
        'prawns',
        'shrimp',
        'egg',
        'eggs',
        'tofu',
        'tempeh',
        'lentil',
        'lentils',
        'chickpea',
        'chickpeas',
        'chick peas',
        'beans',
        'edamame',
    ],
    grains: [
        'rice',
        'quinoa',
        'oat',
        'oats',
        'pasta',
        'noodle',
        'noodles',
        'couscous',
        'bulgur',
        'barley',
        'bread',
        'tortilla',
        'tortillas',
        'buckwheat',
    ],
};

function hasAlias(name: string, aliases: readonly string[]) {
    return aliases.some((alias) => name.includes(` ${alias} `));
}

const pantryAliases = [
    'oil',
    'sauce',
    'stock',
    'broth',
    'dressing',
    'milk',
    'yogurt',
    'yoghurt',
    'cheese',
    'butter',
];

export function getQuickAddCategory(
    name: string,
): QuickAddCategoryId | undefined {
    const words = ` ${normalizeIngredientName(name).replace(/[^a-z0-9]+/g, ' ')} `;
    // Exclude pantry products such as chicken stock or almond milk. Nuts and
    // seeds take precedence so pumpkin seeds don't appear under Vegetables.
    if (hasAlias(words, pantryAliases)) return;
    for (const category of [
        'nuts-seeds',
        'vegetables',
        'proteins',
        'grains',
    ] as const) {
        if (hasAlias(words, categoryAliases[category])) return category;
    }
}

export function groupQuickAddIngredients(records: UserIngredient[]) {
    const groups: Record<QuickAddCategoryId, UserIngredient[]> = {
        vegetables: [],
        proteins: [],
        grains: [],
        'nuts-seeds': [],
    };
    const seen = new Set<string>();
    for (const record of records) {
        const name = normalizeIngredientName(record.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const category = getQuickAddCategory(name);
        if (category) groups[category].push(record);
    }
    return groups;
}

export const starterIngredients: Record<QuickAddCategoryId, string[]> = {
    vegetables: [
        'Broccoli',
        'Carrot',
        'Spinach',
        'Tomato',
        'Onion',
        'Bell pepper',
        'Zucchini',
        'Cucumber',
        'Mushrooms',
        'Potato',
        'Cauliflower',
        'Garlic',
    ],
    proteins: [
        'Chicken breast',
        'Eggs',
        'Salmon',
        'Tuna',
        'Ground beef',
        'Pork loin',
        'Turkey mince',
        'Tofu',
        'Lentils',
        'Chickpeas',
        'Black beans',
        'Tempeh',
        'Edamame',
        'Greek yogurt',
        'Cottage cheese',
        'Shrimp',
    ],
    grains: [
        'White rice',
        'Brown rice',
        'Quinoa',
        'Oats',
        'Pasta',
        'Couscous',
        'Whole wheat bread',
        'Tortillas',
        'Noodles',
        'Rice noodles',
        'Buckwheat',
        'Barley',
    ],
    'nuts-seeds': [
        'Almonds',
        'Walnuts',
        'Cashews',
        'Peanuts',
        'Pecans',
        'Pistachios',
        'Chia seeds',
        'Flax seeds',
        'Sunflower seeds',
        'Pumpkin seeds',
    ],
};

export type QuickAddOption = {
    key: string;
    name: string;
    saved: boolean;
};

/* Saved records first, then starters the user has not already saved. */
export function getQuickAddOptions(
    records: UserIngredient[],
    category: QuickAddCategoryId,
): QuickAddOption[] {
    const saved = groupQuickAddIngredients(records)[category];
    const seen = new Set(saved.map((r) => normalizeIngredientName(r.name)));
    const options: QuickAddOption[] = saved.map((record) => ({
        key: `saved:${record.ingredientId}`,
        name: record.name.trim(),
        saved: true,
    }));
    for (const name of starterIngredients[category]) {
        const normalized = normalizeIngredientName(name);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        options.push({ key: `starter:${normalized}`, name, saved: false });
    }
    return options;
}
