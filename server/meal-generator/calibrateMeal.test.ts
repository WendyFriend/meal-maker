import { describe, expect, it } from 'vitest';
import type { MealIngredient } from '../../shared/types/types.ts';
import { calibrateMeal, getMealTotals } from './calibrateMeal.ts';
import { calibrateToRequirements } from './algorithms/generateMealOllama.ts';

const ingredient = (
    name: string,
    weight: number,
    caloriesPer100g: number,
    proteinPer100g: number,
): MealIngredient => ({
    name,
    weight,
    caloriesPer100g,
    proteinPer100g,
    carbohydratePer100g: 0,
    fatPer100g: 0,
});

// Roughly what the model returned for a 1500 kcal target (~720 kcal).
const underweightMeal = [
    ingredient('Tofu', 300, 76, 8),
    ingredient('Quinoa', 350, 120, 4.4),
    ingredient('Red pepper', 200, 31, 1),
];

describe('calibrateMeal', () => {
    it('scales portions onto the calorie target within 2%', () => {
        const result = calibrateMeal(underweightMeal, { calories: 1500 });
        const { calories } = getMealTotals(result);

        expect(Math.abs(calories - 1500)).toBeLessThanOrEqual(30);
    });

    it('keeps weights on clean 5 g steps (1 g for small amounts)', () => {
        const result = calibrateMeal(
            [...underweightMeal, ingredient('Olive oil', 10, 884, 0)],
            { calories: 900 },
        );

        for (const { weight } of result) {
            expect(weight < 20 || weight % 5 === 0).toBe(true);
        }
    });

    it('hits a protein target by rebalancing protein-dense ingredients', () => {
        const meal = [
            ingredient('Salmon', 200, 208, 20),
            ingredient('Potato', 250, 77, 2),
            ingredient('Olive oil', 25, 884, 0),
        ];
        const result = calibrateMeal(meal, {
            calories: 800,
            proteinPercentage: 30,
        });
        const totals = getMealTotals(result);

        expect(Math.abs(totals.calories - 800)).toBeLessThanOrEqual(16);
        expect(totals.proteinPercentage).toBeGreaterThan(27);
        expect(totals.proteinPercentage).toBeLessThan(33);
    });

    it('falls back to uniform scaling when protein is out of reach', () => {
        const meal = [
            ingredient('Rice', 200, 360, 7),
            ingredient('Oil', 10, 884, 0),
        ];
        const result = calibrateMeal(meal, {
            calories: 1000,
            proteinPercentage: 40,
        });

        expect(
            Math.abs(getMealTotals(result).calories - 1000),
        ).toBeLessThanOrEqual(20);
    });
});

describe('calibrateToRequirements', () => {
    it('leaves portions alone without a calorie target', () => {
        expect(calibrateToRequirements(underweightMeal, {})).toBe(
            underweightMeal,
        );
    });

    it('aims 20% under the target for "lower calorie"', () => {
        const result = calibrateToRequirements(underweightMeal, {
            calories: 1000,
            variation: 'lower-calorie',
        });

        expect(
            Math.abs(getMealTotals(result).calories - 800),
        ).toBeLessThanOrEqual(16);
    });

    it('lifts the protein share for "higher protein"', () => {
        const before = getMealTotals(underweightMeal).proteinPercentage;
        const result = calibrateToRequirements(underweightMeal, {
            variation: 'higher-protein',
        });

        expect(getMealTotals(result).proteinPercentage).toBeGreaterThan(
            before + 5,
        );
    });
});
