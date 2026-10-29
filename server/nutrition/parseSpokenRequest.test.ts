// Tests for the spoken-request parser.
//
// The splitting and target extraction are deterministic and are where the bugs
// live, so they are tested directly. The model fallback is exercised only for
// its reply parsing, since calling a model in a unit test would be neither fast
// nor repeatable.
import { describe, expect, it } from 'vitest';

import {
    detectMealPeriod,
    extractTargets,
    parseModelItems,
    parseModelReply,
    readRequest,
    splitIngredientList,
    stripMealPeriod,
} from './parseSpokenRequest.js';

describe('splitIngredientList', () => {
    it('splits a comma and "and" list', () => {
        expect(splitIngredientList('tomatoes, potatoes, egg and tofu')).toEqual([
            'tomatoes',
            'potatoes',
            'egg',
            'tofu',
        ]);
    });

    it('strips a leading "I want some"', () => {
        expect(splitIngredientList('I want some rice')).toEqual(['rice']);
    });

    it('strips stacked filler, e.g. "some of the rice"', () => {
        expect(splitIngredientList('some of the rice')).toEqual(['rice']);
    });

    it('does not split words containing "and"', () => {
        expect(splitIngredientList('sandwich and brandy')).toEqual(['sandwich', 'brandy']);
    });

    it('does not treat the "and" inside a plain word as a separator', () => {
        expect(splitIngredientList('candy')).toEqual(['candy']);
    });

    it('handles semicolons, slashes and plus signs', () => {
        expect(splitIngredientList('rice; beans / corn + peas')).toEqual([
            'rice',
            'beans',
            'corn',
            'peas',
        ]);
    });

    it('removes a trailing calorie claim from the name', () => {
        expect(splitIngredientList('tofu 500 calories')).toEqual(['tofu']);
    });

    it('removes a trailing gram claim from the name', () => {
        expect(splitIngredientList('chicken breast 40g protein')).toEqual(['chicken breast']);
    });

    it('removes a trailing percentage claim from the name', () => {
        expect(splitIngredientList('greek yoghurt 30% protein')).toEqual(['greek yoghurt']);
    });

    it('keeps a name that itself contains digits', () => {
        expect(splitIngredientList('5 spice powder')).toEqual(['5 spice powder']);
    });

    it('drops entries shorter than two characters', () => {
        expect(splitIngredientList('a, rice, b')).toEqual(['rice']);
    });

    it('collapses repeated whitespace', () => {
        expect(splitIngredientList('  brown    rice ')).toEqual(['brown rice']);
    });

    it('caps the list so one sentence cannot fan out without limit', () => {
        const many = Array.from({ length: 20 }, (_, i) => `food${i}`).join(', ');
        expect(splitIngredientList(many)).toHaveLength(8);
    });

    it('returns an empty array for empty input', () => {
        expect(splitIngredientList('')).toEqual([]);
        expect(splitIngredientList('   ')).toEqual([]);
    });
});

describe('extractTargets', () => {
    it('reads a percentage protein goal', () => {
        expect(extractTargets('greek yoghurt 30% protein')).toEqual([
            { nutrient: 'protein', amount: 30, unit: '%' },
        ]);
    });

    it('reads a grams protein goal', () => {
        expect(extractTargets('40g protein')).toEqual([
            { nutrient: 'protein', amount: 40, unit: 'g' },
        ]);
    });

    it('reads a calories goal', () => {
        expect(extractTargets('500 calories')).toEqual([
            { nutrient: 'calories', amount: 500, unit: 'kcal' },
        ]);
    });

    it('reads kcal as calories', () => {
        expect(extractTargets('500 kcal')).toEqual([
            { nutrient: 'calories', amount: 500, unit: 'kcal' },
        ]);
    });

    it('reads the nutrient before the amount', () => {
        expect(extractTargets('protein 40g')).toEqual([
            { nutrient: 'protein', amount: 40, unit: 'g' },
        ]);
    });

    it('reads several goals in one sentence', () => {
        // Order follows how the patterns are applied, not the text order:
        // "<amount><unit> <nutrient>" first, then bare calories.
        expect(extractTargets('tofu 500 calories 40g protein')).toEqual([
            { nutrient: 'protein', amount: 40, unit: 'g' },
            { nutrient: 'calories', amount: 500, unit: 'kcal' },
        ]);
    });

    it('canonicalises aliases', () => {
        expect(extractTargets('20g carbohydrates')[0].nutrient).toBe('carbs');
        expect(extractTargets('5g fiber')[0].nutrient).toBe('fibre');
    });

    it('does not treat a food quantity as a goal', () => {
        // "200g of rice" is how much rice, not a nutrition target.
        expect(extractTargets('200g of rice')).toEqual([]);
    });

    it('ignores a figure with no recognised nutrient', () => {
        expect(extractTargets('30g of cheese')).toEqual([]);
    });

    it('rejects a percentage above 100', () => {
        expect(extractTargets('130% protein')).toEqual([]);
    });

    it('rejects an implausible gram figure', () => {
        expect(extractTargets('3000g protein')).toEqual([]);
    });

    it('accepts 100% exactly', () => {
        expect(extractTargets('100% protein')).toEqual([
            { nutrient: 'protein', amount: 100, unit: '%' },
        ]);
    });

    it('keeps the same nutrient in different units', () => {
        const targets = extractTargets('30g protein and 30% protein');
        expect(targets).toHaveLength(2);
    });

    it('de-duplicates a repeated identical claim', () => {
        expect(extractTargets('40g protein, 40g protein')).toHaveLength(1);
    });

    it('is case-insensitive', () => {
        expect(extractTargets('40G PROTEIN')).toEqual([
            { nutrient: 'protein', amount: 40, unit: 'g' },
        ]);
    });

    it('returns an empty array when nothing was stated', () => {
        expect(extractTargets('tomatoes and egg')).toEqual([]);
        expect(extractTargets('')).toEqual([]);
    });
});

describe('detectMealPeriod', () => {
    it('detects each of the four meal periods', () => {
        expect(detectMealPeriod('eggs for breakfast')?.mealType).toBe('breakfast');
        expect(detectMealPeriod('a salad for lunch')?.mealType).toBe('lunch');
        expect(detectMealPeriod('a quick snack')?.mealType).toBe('snack');
        expect(detectMealPeriod('something for dinner')?.mealType).toBe('dinner');
    });

    it('is case-insensitive', () => {
        expect(detectMealPeriod('DINNER with rice')?.mealType).toBe('dinner');
    });

    it('keeps the word that was actually said', () => {
        expect(detectMealPeriod('supper with rice')?.said).toBe('supper');
    });

    it('treats supper as dinner and brunch as breakfast', () => {
        expect(detectMealPeriod('supper')?.mealType).toBe('dinner');
        expect(detectMealPeriod('brunch')?.mealType).toBe('breakfast');
    });

    it('does not match a meal word inside another word', () => {
        // "snacking" must not become "snack", or the phrase loses its meaning.
        expect(detectMealPeriod('snacking on carrots')).toBeNull();
        expect(detectMealPeriod('breakfasting')).toBeNull();
    });

    it('does not treat green tea as the meal "tea"', () => {
        expect(detectMealPeriod('green tea and honey')).toBeNull();
        expect(detectMealPeriod('a teaspoon of salt')).toBeNull();
    });

    it('treats a bare "tea" as dinner', () => {
        expect(detectMealPeriod('sausages for tea')?.mealType).toBe('dinner');
    });

    it('returns null when no meal is named', () => {
        expect(detectMealPeriod('tofu and rice')).toBeNull();
        expect(detectMealPeriod('')).toBeNull();
    });

    it('takes the first period when two are named', () => {
        expect(detectMealPeriod('lunch and dinner')?.mealType).toBe('lunch');
    });
});

describe('stripMealPeriod', () => {
    it('removes the meal word so it is not treated as an ingredient', () => {
        const period = detectMealPeriod('eggs for breakfast');
        expect(stripMealPeriod('eggs for breakfast', period)).toBe('eggs for');
    });

    it('removes a mid-sentence meal word', () => {
        const period = detectMealPeriod('rice and chicken for dinner please');
        expect(stripMealPeriod('rice and chicken for dinner please', period)).toBe(
            'rice and chicken for please',
        );
    });

    it('leaves the text alone when no period was found', () => {
        expect(stripMealPeriod('tofu and rice', null)).toBe('tofu and rice');
    });
});

describe('parseModelItems', () => {
    it('reads a plain items array', () => {
        expect(parseModelItems('{"items":["rice","chicken"]}')).toEqual(['rice', 'chicken']);
    });

    it('tolerates a fenced reply', () => {
        expect(parseModelItems('```json\n{"items":["rice"]}\n```')).toEqual(['rice']);
    });

    it('tolerates prose around the JSON', () => {
        expect(parseModelItems('Here: {"items":["rice"]} done')).toEqual(['rice']);
    });

    it('trims and drops edge punctuation', () => {
        expect(parseModelItems('{"items":["  rice  ","egg."]}')).toEqual(['rice', 'egg']);
    });

    it('drops duplicates and non-strings', () => {
        expect(parseModelItems('{"items":["rice","rice",42,null]}')).toEqual(['rice']);
    });

    it('caps the list', () => {
        const many = JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => `f${i}`) });
        expect(parseModelItems(many)).toHaveLength(8);
    });

    it('returns null when the reply is unreadable', () => {
        expect(parseModelItems('no json here')).toBeNull();
        expect(parseModelItems('{"items":["rice"')).toBeNull();
        expect(parseModelItems('{"items":[]}')).toBeNull();
        expect(parseModelItems(null)).toBeNull();
    });
});

describe('readRequest', () => {
    it('reads amounts tied to a food as that food\'s quantity, not a goal', () => {
        expect(readRequest('500 calories of bread and 100 grams of rice')).toEqual({
            entries: [
                { term: 'bread', quantity: { amount: 500, unit: 'kcal' } },
                { term: 'rice', quantity: { amount: 100, unit: 'g' } },
            ],
            targets: [],
        });
    });

    it('reads an amount after the food', () => {
        expect(readRequest('bread 200g').entries).toEqual([{ term: 'bread', quantity: { amount: 200, unit: 'g' } }]);
        expect(readRequest('tofu 500 calories').entries).toEqual([
            { term: 'tofu', quantity: { amount: 500, unit: 'kcal' } },
        ]);
    });

    it('reads whole-meal goals', () => {
        expect(readRequest('chicken, broccoli, 600 calories total, 40 grams of protein')).toEqual({
            entries: [
                { term: 'chicken', quantity: null },
                { term: 'broccoli', quantity: null },
            ],
            targets: [
                { nutrient: 'calories', amount: 600, unit: 'kcal' },
                { nutrient: 'protein', amount: 40, unit: 'g' },
            ],
        });
        expect(readRequest('salmon and rice 30 percent protein').targets).toEqual([
            { nutrient: 'protein', amount: 30, unit: '%' },
        ]);
    });

    it('treats "a 600 calorie meal" as a goal', () => {
        const read = readRequest('a 600 calorie meal with chicken breast');
        expect(read.targets).toEqual([{ nutrient: 'calories', amount: 600, unit: 'kcal' }]);
        expect(read.entries).toEqual([{ term: 'chicken breast', quantity: null }]);
    });

    it('converts kilojoules and kilograms, and reads "1,000" as one number', () => {
        expect(readRequest('1,000 kj of pasta').entries).toEqual([
            { term: 'pasta', quantity: { amount: 239, unit: 'kcal' } },
        ]);
        expect(readRequest('1kg of mince').entries).toEqual([
            { term: 'mince', quantity: { amount: 1000, unit: 'g' } },
        ]);
        expect(readRequest('2000 kilojoules total').targets).toEqual([
            { nutrient: 'calories', amount: 478, unit: 'kcal' },
        ]);
    });

    it('keeps a food whose name starts with a nutrient', () => {
        expect(readRequest('100g protein powder').entries).toEqual([
            { term: 'protein powder', quantity: { amount: 100, unit: 'g' } },
        ]);
    });

    it('leaves counts and spelled numbers in the name for the model', () => {
        expect(readRequest('2 eggs').entries).toEqual([{ term: '2 eggs', quantity: null }]);
    });
});

describe('parseModelReply', () => {
    it('reads items with amounts and whole-meal totals', () => {
        expect(
            parseModelReply(
                '{"items":[{"name":"bread","amount":500,"unit":"kcal"},{"name":"mince","amount":0.5,"unit":"kg"},{"name":"broccoli"}],' +
                    '"totals":[{"nutrient":"protein","amount":40,"unit":"g"},{"nutrient":"calories","amount":2000,"unit":"kj"}]}',
            ),
        ).toEqual({
            items: [
                { name: 'bread', quantity: { amount: 500, unit: 'kcal' } },
                { name: 'mince', quantity: { amount: 500, unit: 'g' } },
                { name: 'broccoli', quantity: null },
            ],
            totals: [
                { nutrient: 'protein', amount: 40, unit: 'g' },
                { nutrient: 'calories', amount: 478, unit: 'kcal' },
            ],
        });
    });

    it('drops implausible figures and nutrients listed as foods', () => {
        expect(
            parseModelReply(
                '{"items":[{"name":"rice","amount":90000,"unit":"g"},{"name":"protein"}],"totals":[{"nutrient":"protein","amount":150,"unit":"%"}]}',
            ),
        ).toEqual({ items: [{ name: 'rice', quantity: null }], totals: [] });
    });

    it('accepts plain string items', () => {
        expect(parseModelReply('{"items":["rice"],"totals":[]}')?.items).toEqual([{ name: 'rice', quantity: null }]);
    });
});
