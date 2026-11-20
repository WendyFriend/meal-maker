import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

export function normalizeIngredientName(name: string): string {
    return name.trim().toLowerCase();
}

export function isUserIngredient(
    ingredient: UserIngredient | IngredientInfo,
): ingredient is UserIngredient {
    return 'ingredientId' in ingredient;
}

/** Keep user-provided values while filling their missing nutrition fields. */
export function mergeIngredientNutrition(
    ingredient: IngredientInfo,
    lookup: IngredientInfo,
): IngredientInfo {
    return {
        ...lookup,
        ...Object.fromEntries(
            Object.entries(ingredient).filter(([, value]) => value != null),
        ),
        name: ingredient.name,
    };
}

const requiredMacroFields = [
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
] as const;

export function needsMacroNutrition(ingredient: IngredientInfo): boolean {
    return requiredMacroFields.some((field) => {
        const value = ingredient[field];
        return (
            typeof value !== 'number' || !Number.isFinite(value) || value < 0
        );
    });
}

/** Lowercase words, roughly singular, so "Pumpkins" reads as "pumpkin". */
function searchWords(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((word) =>
            word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
                ? word.slice(0, -1)
                : word,
        );
}

/**
 * How closely a food's name matches what was typed (lower is closer): the
 * name itself, then the food with qualifiers ("Pumpkin, raw"), then names
 * that start with it ("Pumpkin seeds"), then names containing it as a word.
 */
export function searchCloseness(name: string, query: string): number {
    const typed = searchWords(query).join(' ');
    if (!typed) return 4;
    const words = searchWords(name).join(' ');
    if (words === typed) return 0;
    if (searchWords(name.split(',')[0]).join(' ') === typed) return 1;
    if (words.startsWith(`${typed} `)) return 2;
    if (` ${words} `.includes(` ${typed} `)) return 3;
    return 4;
}

/** Closest matches first; equally close ones keep their order. */
export function rankByCloseness<T>(
    items: T[],
    query: string,
    nameOf: (item: T) => string,
): T[] {
    return items
        .map((item, index) => ({
            item,
            index,
            score: searchCloseness(nameOf(item), query),
        }))
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map(({ item }) => item);
}
