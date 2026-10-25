import { describe, expect, it, vi } from 'vitest';
import type {
    IngredientMatch,
    MealIngredient,
    NutritionSearchResult,
} from '../../shared/types/types.ts';
import {
    enrichIngredients,
    getEstimatedIngredients,
    namesForGuidance,
    nameTokens,
    pairWithInputs,
    reattachNutrition,
    type MatchLookup,
} from './authoritativeNutrition.ts';

function usdaFood(
    name: string,
    values: Partial<NutritionSearchResult> = {},
): NutritionSearchResult {
    return {
        name,
        caloriesPer100g: 100,
        proteinPer100g: 10,
        carbohydratePer100g: 5,
        fatPer100g: 2,
        fiberPer100g: 3,
        micronutrientsPer100g: { iron: 2, vitaminC: 5 },
        usda: { fdcId: 1, description: `${name}, raw` },
        nutritionSource: 'usda',
        source: 'usda',
        description: `${name}, raw`,
        ...values,
    };
}

function lookupFrom(
    foods: Record<string, NutritionSearchResult>,
    confidence: IngredientMatch['confidence'] = 'high',
): MatchLookup {
    return vi.fn(async (name: string) => ({
        query: name,
        match: foods[name.toLowerCase()] ?? null,
        alternatives: [],
        confidence: foods[name.toLowerCase()] ? confidence : 'low',
    }));
}

function modelIngredient(
    name: string,
    values: Partial<MealIngredient> = {},
): MealIngredient {
    return {
        name,
        weight: 100,
        caloriesPer100g: 999,
        proteinPer100g: 99,
        carbohydratePer100g: 99,
        fatPer100g: 99,
        ...values,
    };
}

describe('enrichIngredients', () => {
    it('fills ingredients without macros from the USDA match', async () => {
        const [chicken] = await enrichIngredients(
            [{ name: 'Chicken' }],
            lookupFrom({
                chicken: usdaFood('Chicken', { caloriesPer100g: 120 }),
            }),
        );

        expect(chicken).toMatchObject({
            name: 'Chicken',
            caloriesPer100g: 120,
            fiberPer100g: 3,
            micronutrientsPer100g: { iron: 2, vitaminC: 5 },
            nutritionSource: 'usda',
            usda: { fdcId: 1 },
        });
    });

    it('keeps user macros and only borrows missing micronutrients', async () => {
        const [rice] = await enrichIngredients(
            [
                {
                    name: 'Rice',
                    caloriesPer100g: 130,
                    proteinPer100g: 2.7,
                    carbohydratePer100g: 28,
                    fatPer100g: 0.3,
                },
            ],
            lookupFrom({ rice: usdaFood('Rice', { caloriesPer100g: 365 }) }),
        );

        expect(rice).toMatchObject({
            caloriesPer100g: 130,
            proteinPer100g: 2.7,
            fiberPer100g: 3,
            micronutrientsPer100g: { iron: 2, vitaminC: 5 },
            nutritionSource: 'user',
        });
    });

    it('keeps a USDA food the client already resolved, without a lookup', async () => {
        const own = {
            name: 'Rice',
            caloriesPer100g: 130,
            proteinPer100g: 2.7,
            carbohydratePer100g: 28,
            fatPer100g: 0.3,
            fiberPer100g: 0.4,
            micronutrientsPer100g: { iron: 9 },
            usda: { fdcId: 77, description: 'Rice, mine' },
        };
        const lookup = vi.fn(lookupFrom({ rice: usdaFood('Rice') }));
        const [rice] = await enrichIngredients([own], lookup);

        expect(rice).toMatchObject({
            ...own,
            nutritionSource: 'usda',
        });
        expect(lookup).not.toHaveBeenCalled();
    });

    it('leaves unmatched ingredients for the model to estimate', async () => {
        const [sauce, mine] = await enrichIngredients(
            [
                { name: 'house sauce' },
                {
                    name: 'my own mix',
                    caloriesPer100g: 1,
                    proteinPer100g: 1,
                    carbohydratePer100g: 1,
                    fatPer100g: 1,
                },
            ],
            lookupFrom({}),
        );

        expect(sauce).toEqual({ name: 'house sauce' });
        expect(mine).toMatchObject({ nutritionSource: 'user' });
        expect(mine.micronutrientsPer100g).toBeUndefined();
    });

    it('ignores low-confidence matches', async () => {
        const [stew] = await enrichIngredients(
            [{ name: 'Stew' }],
            lookupFrom({ stew: usdaFood('Stew') }, 'low'),
        );

        expect(stew).toEqual({ name: 'Stew' });
    });
});

describe('nameTokens / pairWithInputs', () => {
    it('ignores cuts, states and plurals', () => {
        expect(nameTokens('Chicken breast, diced')).toEqual([
            'chicken',
            'breast',
        ]);
        expect(nameTokens('Tomatoes (ripe)')).toEqual(['tomato']);
        expect(nameTokens('Dried')).toEqual(['dried']);
    });

    it('pairs renamed ingredients with their inputs', () => {
        expect(
            pairWithInputs(
                ['Chicken breast, diced', 'Brown rice, cooked', 'Olive oil'],
                ['chicken breast', 'brown rice'],
            ),
        ).toEqual([0, 1, undefined]);
    });

    it('prefers the closest input and uses each input once', () => {
        expect(
            pairWithInputs(['Brown rice', 'Rice'], ['rice', 'brown rice']),
        ).toEqual([1, 0]);
        // Only one model line can claim the single input.
        expect(pairWithInputs(['Rice', 'Rice'], ['rice'])).toEqual([
            0,
            undefined,
        ]);
    });

    it('does not pair unrelated or only partly overlapping names', () => {
        expect(pairWithInputs(['Sweet corn'], ['sweet potato'])).toEqual([
            undefined,
        ]);
    });
});

describe('reattachNutrition', () => {
    it('overwrites the model numbers with authoritative data', async () => {
        const inputs = await enrichIngredients(
            [{ name: 'chicken breast' }],
            lookupFrom({
                'chicken breast': usdaFood('Chicken breast', {
                    caloriesPer100g: 120,
                    proteinPer100g: 23,
                }),
            }),
        );
        const [chicken] = await reattachNutrition(
            [
                modelIngredient('Chicken breast, diced', {
                    weight: 150,
                    micronutrientsPer100g: { iron: 1000 },
                }),
            ],
            inputs,
            lookupFrom({}),
        );

        expect(chicken).toMatchObject({
            name: 'Chicken breast, diced',
            weight: 150,
            caloriesPer100g: 120,
            proteinPer100g: 23,
            carbohydratePer100g: 5,
            fatPer100g: 2,
            fiberPer100g: 3,
            micronutrientsPer100g: { iron: 2, vitaminC: 5 },
            usda: { fdcId: 1 },
            nutritionSource: 'usda',
        });
    });

    it('looks up staples the model added and estimates the rest', async () => {
        const lookup = lookupFrom({
            'olive oil': usdaFood('Oil, olive', {
                caloriesPer100g: 884,
                proteinPer100g: 0,
            }),
        });
        const result = await reattachNutrition(
            [
                modelIngredient('Olive oil', { weight: 10 }),
                modelIngredient('Secret spice', {
                    weight: 2,
                    caloriesPer100g: 250,
                    proteinPer100g: 10,
                    carbohydratePer100g: 40,
                    fatPer100g: 5,
                    fiberPer100g: 12,
                }),
            ],
            [],
            lookup,
        );

        expect(result[0]).toMatchObject({
            caloriesPer100g: 884,
            nutritionSource: 'usda',
        });
        expect(result[1]).toEqual({
            name: 'Secret spice',
            weight: 2,
            caloriesPer100g: 250,
            proteinPer100g: 10,
            carbohydratePer100g: 40,
            fatPer100g: 5,
            fiberPer100g: 12,
            nutritionSource: 'estimated',
        });
        expect(getEstimatedIngredients(result)).toEqual(['Secret spice']);
    });

    it('keeps the model estimate for an unmatched input and drops invented fields', async () => {
        const inputs = await enrichIngredients(
            [{ name: 'house sauce' }],
            lookupFrom({}),
        );
        const [sauce] = await reattachNutrition(
            [
                {
                    ...modelIngredient('House sauce'),
                    micronutrientsPer100g: { iron: 50 },
                    usda: { fdcId: 5, description: 'made up' },
                } as MealIngredient,
            ],
            inputs,
            lookupFrom({}),
        );

        expect(sauce.nutritionSource).toBe('estimated');
        expect(sauce.caloriesPer100g).toBe(999);
        expect(sauce.micronutrientsPer100g).toBeUndefined();
        expect(sauce.usda).toBeUndefined();
    });

    it('uses user-supplied data for user ingredients', async () => {
        const inputs = await enrichIngredients(
            [
                {
                    name: 'Granola',
                    caloriesPer100g: 450,
                    proteinPer100g: 10,
                    carbohydratePer100g: 60,
                    fatPer100g: 18,
                },
            ],
            lookupFrom({}),
        );
        const [granola] = await reattachNutrition(
            [modelIngredient('Granola')],
            inputs,
            lookupFrom({}),
        );

        expect(granola).toMatchObject({
            caloriesPer100g: 450,
            fatPer100g: 18,
            nutritionSource: 'user',
        });
    });
});

describe('namesForGuidance', () => {
    it('adds only inputs the meal does not already cover', () => {
        expect(
            namesForGuidance(
                ['Kidney beans, boiled', 'Olive oil'],
                ['dried kidney beans', 'spinach'],
            ),
        ).toEqual(['Kidney beans, boiled', 'Olive oil', 'spinach']);
    });
});
