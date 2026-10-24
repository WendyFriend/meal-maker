import type { UserIngredient } from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';

// The app has saved ingredient records, but no category metadata. These aliases
// only classify existing records; they never supply ingredients or nutrition.
export const quickAddCategories = [
    { id: 'vegetables', name: 'Vegetables' },
    { id: 'proteins', name: 'Proteins' },
    { id: 'grains', name: 'Grains' },
    { id: 'extras', name: 'Extras' },
] as const;

export type QuickAddCategory = (typeof quickAddCategories)[number];
export type QuickAddCategoryId = QuickAddCategory['id'];

const categoryAliases = {
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

export function getQuickAddCategory(name: string): QuickAddCategoryId {
    const words = ` ${normalizeIngredientName(name).replace(/[^a-z0-9]+/g, ' ')} `;
    // Pantry products such as chicken stock or rice milk belong in Extras.
    if (
        hasAlias(words, [
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
        ])
    )
        return 'extras';
    for (const category of ['vegetables', 'proteins', 'grains'] as const) {
        if (hasAlias(words, categoryAliases[category])) return category;
    }
    return 'extras';
}

export function groupQuickAddIngredients(records: UserIngredient[]) {
    const groups: Record<QuickAddCategoryId, UserIngredient[]> = {
        vegetables: [],
        proteins: [],
        grains: [],
        extras: [],
    };
    const seen = new Set<string>();
    for (const record of records) {
        const name = normalizeIngredientName(record.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        groups[getQuickAddCategory(name)].push(record);
    }
    return groups;
}
