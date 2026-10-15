import { describe, expect, it } from 'vitest';
import { isGenerateMealResponse } from './validateMealResponse.ts';

const validMeal = {
    mealName: 'Chicken and rice',
    ingredients: [
        {
            name: 'Chicken breast',
            weight: 150,
            caloriesPer100g: 165,
            proteinPer100g: 31,
            carbohydratePer100g: 0,
            fatPer100g: 3.6,
        },
    ],
    instructions: ['Cook the rice.'],
};

describe('isGenerateMealResponse', () => {
    it('accepts a valid meal response', () => {
        expect(isGenerateMealResponse(validMeal)).toBe(true);
    });

    it('accepts optional nutrition fields on ingredients', () => {
        expect(
            isGenerateMealResponse({
                ...validMeal,
                ingredients: [
                    {
                        ...validMeal.ingredients[0],
                        saturatedFatPer100g: 1.1,
                        fiberPer100g: 0,
                    },
                ],
            }),
        ).toBe(true);
    });

    it('rejects null and non-object values', () => {
        expect(isGenerateMealResponse(null)).toBe(false);
        expect(isGenerateMealResponse('meal')).toBe(false);
        expect(isGenerateMealResponse(42)).toBe(false);
        expect(isGenerateMealResponse(undefined)).toBe(false);
    });

    it('rejects a missing mealName', () => {
        const withoutMealName = { ...validMeal } as Partial<typeof validMeal>;

        delete withoutMealName.mealName;

        expect(isGenerateMealResponse(withoutMealName)).toBe(false);
    });

    it('rejects a non-string mealName', () => {
        expect(isGenerateMealResponse({ ...validMeal, mealName: 123 })).toBe(
            false,
        );
    });

    it('rejects when ingredients is missing or not an array', () => {
        expect(
            isGenerateMealResponse({ ...validMeal, ingredients: undefined }),
        ).toBe(false);
        expect(
            isGenerateMealResponse({ ...validMeal, ingredients: 'many' }),
        ).toBe(false);
    });

    it('rejects an ingredient with a missing field', () => {
        const ingredient = {
            ...validMeal.ingredients[0],
        } as Partial<(typeof validMeal.ingredients)[0]>;

        delete ingredient.fatPer100g;

        expect(
            isGenerateMealResponse({
                ...validMeal,
                ingredients: [ingredient],
            }),
        ).toBe(false);
    });

    it('rejects an ingredient with a wrong field type', () => {
        expect(
            isGenerateMealResponse({
                ...validMeal,
                ingredients: [{ ...validMeal.ingredients[0], weight: '150' }],
            }),
        ).toBe(false);
    });

    it('rejects non-object ingredients like strings or null entries', () => {
        expect(
            isGenerateMealResponse({
                ...validMeal,
                ingredients: ['chicken'],
            }),
        ).toBe(false);
        expect(
            isGenerateMealResponse({
                ...validMeal,
                ingredients: [null],
            }),
        ).toBe(false);
    });

    it('rejects instructions that are missing or contain non-strings', () => {
        expect(
            isGenerateMealResponse({ ...validMeal, instructions: undefined }),
        ).toBe(false);
        expect(
            isGenerateMealResponse({ ...validMeal, instructions: [1, 2] }),
        ).toBe(false);
    });
});
