import { describe, expect, it } from 'vitest';
import type { GenerateMealRequest } from '../../../shared/types/types.ts';
import { buildMealPrompts, getMacroSplit, withoutExtras } from './generateMealOllama.ts';

const chicken = {
    name: 'Chicken',
    caloriesPer100g: 165,
    proteinPer100g: 31,
};

function build(requirements: GenerateMealRequest['requirements']) {
    return buildMealPrompts({ ingredients: [chicken], requirements });
}

describe('getMacroSplit', () => {
    it('defaults to 55/15/30', () => {
        expect(getMacroSplit()).toEqual({ carbs: 55, protein: 15, fat: 30 });
    });

    it('sums to 100 for a custom protein share', () => {
        const split = getMacroSplit(35);
        expect(split.protein).toBe(35);
        expect(split.carbs + split.protein + split.fat).toBe(100);
    });
});

describe('buildMealPrompts', () => {
    it('uses the default split and per-serving wording', () => {
        const { systemPrompt, userPrompt } = build({ calories: 600 });
        expect(systemPrompt).toContain('55% carbs, 15% protein, and 30% fat');
        expect(systemPrompt).toContain('PER SERVING');
        const user = JSON.parse(userPrompt);
        expect(user.targetCaloriesPerServing).toBe(600);
        expect(user.servings).toBe(1);
    });

    it('applies proteinPercentage', () => {
        const { systemPrompt } = build({ proteinPercentage: 40 });
        expect(systemPrompt).toContain('40% protein');
        expect(systemPrompt).not.toContain('15% protein');
    });

    it('maps mealType', () => {
        const { systemPrompt, userPrompt } = build({ mealType: 'breakfast' });
        expect(systemPrompt).toContain('a breakfast dish');
        expect(JSON.parse(userPrompt).mealType).toBe('breakfast');
    });

    it('treats dietary as a hard rule', () => {
        const { systemPrompt } = build({ dietary: ['vegan', 'gluten-free'] });
        expect(systemPrompt).toContain('HARD rule');
        expect(systemPrompt).toContain('vegan');
        expect(systemPrompt).toContain('gluten-free');
        expect(systemPrompt).toContain('leave it out');
    });

    it('maps each variation', () => {
        const different = build({
            variation: 'different',
            previousMealName: 'Chicken Stir Fry',
        });
        expect(different.systemPrompt).toContain(
            'different dish from "Chicken Stir Fry"',
        );
        expect(build({ variation: 'higher-protein' }).systemPrompt).toContain(
            'noticeably higher in protein',
        );
        expect(build({ variation: 'lower-calorie' }).systemPrompt).toContain(
            '20% lower in calories',
        );
    });

    it('omits optional rules when no options are set', () => {
        const { systemPrompt } = build({});
        expect(systemPrompt).not.toContain('HARD rule');
        expect(systemPrompt).not.toContain('20% lower');
    });
});

describe('withoutExtras', () => {
    const requested = [{ name: 'Chicken breast' }, { name: 'Broccoli' }];

    it('drops ingredients the cook did not ask for', () => {
        const kept = withoutExtras(
            [{ name: 'chicken breast' }, { name: 'Olive oil' }, { name: 'broccoli' }, { name: 'Garlic' }],
            requested,
        );
        expect(kept.map((i) => i.name)).toEqual(['chicken breast', 'broccoli']);
    });

    it('keeps everything when a requested ingredient is missing (e.g. left out for diet)', () => {
        const returned = [{ name: 'Broccoli' }, { name: 'Olive oil' }];
        expect(withoutExtras(returned, requested)).toEqual(returned);
    });
});
