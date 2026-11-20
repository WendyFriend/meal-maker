import { describe, expect, it } from 'vitest';
import type { MealIngredient } from '../../shared/types/types';
import { combineFoods } from './foodList';

const food = (
    name: string,
    weight: number,
    extra: Partial<MealIngredient> = {},
): MealIngredient => ({
    name,
    weight,
    caloriesPer100g: 52,
    proteinPer100g: 0.3,
    carbohydratePer100g: 14,
    fatPer100g: 0.2,
    ...extra,
});

describe('combineFoods', () => {
    it('adds up portions of the same food in first-seen order', () => {
        expect(
            combineFoods([
                food('Apple', 100),
                food('Rice', 150, { caloriesPer100g: 130 }),
                food('apple ', 50),
            ]).map(({ name, weight }) => [name, weight]),
        ).toEqual([
            ['Apple', 150],
            ['Rice', 150],
        ]);
    });

    it('matches by database food before the typed name', () => {
        const source = { fdcId: 7, description: 'Oats' };
        expect(
            combineFoods([
                food('Oats', 40, { nutritionSource: source }),
                food('Rolled oats', 60, { nutritionSource: source }),
            ]),
        ).toEqual([food('Oats', 100, { nutritionSource: source })]);
    });

    it('keeps portions with different nutrition apart', () => {
        expect(
            combineFoods([
                food('Apple', 100),
                food('Apple', 100, { caloriesPer100g: 60 }),
                food('Apple', 100, { nutritionUnavailable: true }),
            ]),
        ).toHaveLength(3);
    });
});
