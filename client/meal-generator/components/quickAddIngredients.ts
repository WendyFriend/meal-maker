import type { UserIngredient } from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';
import {
    commonQuickAddIngredients,
    type CommonQuickAddCategoryId,
} from './commonQuickAddIngredients';

export const quickAddCategories = [
    { id: 'saved', name: 'Saved' },
    { id: 'vegetables', name: 'Veggies' },
    { id: 'proteins', name: 'Protein' },
    { id: 'grains', name: 'Grains' },
    { id: 'nuts-seeds', name: 'Nuts & Seeds' },
] as const;

export type QuickAddCategory = (typeof quickAddCategories)[number];
export type QuickAddCategoryId = QuickAddCategory['id'];

export type QuickAddOption = {
    id: string;
    name: string;
    fdcId?: number;
};

type QuickAddSavedIngredient = Pick<
    UserIngredient,
    'ingredientId' | 'name' | 'nutritionSource'
>;

function uniqueSavedIngredients(
    records: QuickAddSavedIngredient[],
): QuickAddOption[] {
    const seen = new Set<string>();
    return records.flatMap((record) => {
        const { ingredientId, name } = record;
        const key = normalizeIngredientName(name);
        if (!key || seen.has(key)) return [];
        seen.add(key);
        return [
            {
                id: `saved:${ingredientId}`,
                name: name.trim(),
                fdcId: record.nutritionSource?.fdcId,
            },
        ];
    });
}

export function groupQuickAddIngredients(
    savedIngredients: QuickAddSavedIngredient[],
): Record<QuickAddCategoryId, QuickAddOption[]> {
    const commonGroup = (category: CommonQuickAddCategoryId) =>
        commonQuickAddIngredients[category].map((ingredient) => ({
            id: `common:${normalizeIngredientName(ingredient.name)}`,
            name: ingredient.name,
            fdcId: ingredient.nutritionSource?.fdcId,
        }));

    return {
        saved: uniqueSavedIngredients(savedIngredients),
        vegetables: commonGroup('vegetables'),
        proteins: commonGroup('proteins'),
        grains: commonGroup('grains'),
        'nuts-seeds': commonGroup('nuts-seeds'),
    };
}

/** Search saved records first, then the same curated catalogue as Quick Add. */
export function getIngredientSearchOptions(
    savedIngredients: QuickAddSavedIngredient[],
): QuickAddOption[] {
    const groups = groupQuickAddIngredients(savedIngredients);
    const candidates = [
        ...groups.saved,
        ...groups.vegetables,
        ...groups.proteins,
        ...groups.grains,
        ...groups['nuts-seeds'],
    ];
    const seen = new Set<string>();

    return candidates.filter(({ name }) => {
        const key = normalizeIngredientName(name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
