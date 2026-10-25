import type { UserIngredient } from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';

// The app has saved ingredient records, but no category metadata. These aliases
// only classify existing records; they never supply ingredients or nutrition.
export const quickAddCategories = [
    { id: 'vegetables', name: 'Vegetables' },
    { id: 'proteins', name: 'Protein' },
    { id: 'grains', name: 'Grains' },
    { id: 'nuts-seeds', name: 'More' },
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
