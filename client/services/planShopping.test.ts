import { describe, expect, it } from 'vitest';
import type { Recipe, ShoppingListItem } from '../../shared/types/recipe';
import {
    addDays,
    getRecipeCalories,
    getWeekDates,
    startOfWeek,
    toDateKey,
} from './mealPlanService';
import {
    aggregateIngredients,
    parseGrams,
    planShoppingMerge,
} from './shoppingListService';

function recipe(
    servings: number | undefined,
    ingredients: [string, number, number?][],
): Recipe {
    return {
        userId: 'u',
        recipeName: 'r',
        instructions: [],
        servings,
        ingredients: ingredients.map(([name, weight, kcal]) => ({
            name,
            weight,
            caloriesPer100g: kcal ?? 100,
            proteinPer100g: 0,
            carbohydratePer100g: 0,
            fatPer100g: 0,
        })),
    } as Recipe;
}

function item(
    id: string,
    name: string,
    quantity?: string,
    checked = false,
): ShoppingListItem {
    return { id, name, quantity, checked };
}

describe('week helpers', () => {
    it('finds Monday for any day of the week', () => {
        // 2026-10-25 is a Sunday.
        expect(toDateKey(startOfWeek(new Date(2026, 9, 25)))).toBe(
            '2026-10-19',
        );
        expect(toDateKey(startOfWeek(new Date(2026, 9, 19)))).toBe(
            '2026-10-19',
        );
        expect(toDateKey(startOfWeek(new Date(2026, 9, 21)))).toBe(
            '2026-10-19',
        );
    });

    it('lists seven days Mon-Sun across a month boundary', () => {
        const days = getWeekDates(new Date(2026, 9, 26)).map(toDateKey);

        expect(days).toHaveLength(7);
        expect(days[0]).toBe('2026-10-26');
        expect(days[6]).toBe('2026-11-01');
        expect(toDateKey(addDays(new Date(2026, 9, 26), -7))).toBe(
            '2026-10-19',
        );
    });
});

describe('getRecipeCalories', () => {
    it('sums per-serving calories', () => {
        expect(
            getRecipeCalories(
                recipe(2, [
                    ['a', 200, 100],
                    ['b', 50, 400],
                ]),
            ),
        ).toBe(400);
    });
});

describe('aggregateIngredients', () => {
    it('multiplies by servings and merges names case-insensitively', () => {
        const result = aggregateIngredients([
            recipe(2, [
                ['Rice', 100],
                ['Egg', 50],
            ]),
            recipe(undefined, [['rice', 30]]),
        ]);

        expect(result).toEqual([
            { name: 'Rice', quantity: '230 g' },
            { name: 'Egg', quantity: '100 g' },
        ]);
    });
});

describe('planShoppingMerge', () => {
    it('merges gram quantities into unchecked items of the same name', () => {
        const plan = planShoppingMerge(
            [item('1', 'Rice', '200 g')],
            [{ name: 'rice', quantity: '50 g' }],
        );

        expect(plan.updates).toEqual([{ id: '1', quantity: '250 g' }]);
        expect(plan.inserts).toEqual([]);
    });

    it('adds separately when the match is checked or not in grams', () => {
        const plan = planShoppingMerge(
            [item('1', 'Rice', '200 g', true), item('2', 'Milk', '2 cartons')],
            [
                { name: 'Rice', quantity: '50 g' },
                { name: 'Milk', quantity: '100 g' },
                { name: 'Salt' },
            ],
        );

        expect(plan.updates).toEqual([]);
        expect(plan.inserts.map((i) => i.name)).toEqual([
            'Rice',
            'Milk',
            'Salt',
        ]);
    });

    it('combines repeated incoming items', () => {
        const plan = planShoppingMerge(
            [],
            [
                { name: 'Oats', quantity: '40 g' },
                { name: 'oats', quantity: '60 g' },
            ],
        );

        expect(plan.inserts).toEqual([{ name: 'Oats', quantity: '100 g' }]);
    });
});

describe('parseGrams', () => {
    it('only accepts "<number> g"', () => {
        expect(parseGrams('12.5 g')).toBe(12.5);
        expect(parseGrams('300g')).toBe(300);
        expect(parseGrams('2 cups')).toBeNull();
        expect(parseGrams(undefined)).toBeNull();
    });
});
