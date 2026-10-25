import { describe, expect, it } from 'vitest';
import { describeDietConflicts, getDietConflicts } from './diet';

describe('getDietConflicts', () => {
    it('flags meat and fish for vegetarians and vegans', () => {
        expect(getDietConflicts('Chicken breast', ['vegetarian'])).toEqual([
            'vegetarian',
        ]);
        expect(getDietConflicts('Smoked salmon', ['vegan'])).toEqual(['vegan']);
        expect(getDietConflicts('Tofu', ['vegan', 'vegetarian'])).toEqual([]);
    });

    it('flags dairy, eggs and honey only for vegans', () => {
        expect(getDietConflicts('Greek yogurt', ['vegetarian'])).toEqual([]);
        expect(getDietConflicts('Greek yogurt', ['vegan'])).toEqual(['vegan']);
        expect(getDietConflicts('Eggs', ['vegan'])).toEqual(['vegan']);
        expect(getDietConflicts('Honey', ['vegan'])).toEqual(['vegan']);
    });

    it('does not trip on look-alike or plant-based names', () => {
        const vegan = ['vegan'] as const;

        expect(getDietConflicts('Eggplant', [...vegan])).toEqual([]);
        expect(getDietConflicts('Butternut squash', [...vegan])).toEqual([]);
        expect(getDietConflicts('Peanut butter', [...vegan])).toEqual([]);
        expect(getDietConflicts('Oat milk', [...vegan])).toEqual([]);
        expect(getDietConflicts('Chickpeas', [...vegan])).toEqual([]);
    });

    it('handles dairy-free and gluten-free', () => {
        expect(getDietConflicts('Cheddar', ['dairy-free'])).toEqual([
            'dairy-free',
        ]);
        expect(getDietConflicts('Coconut milk', ['dairy-free'])).toEqual([]);
        expect(getDietConflicts('Wholewheat pasta', ['gluten-free'])).toEqual([
            'gluten-free',
        ]);
        expect(getDietConflicts('Rice noodles', ['gluten-free'])).toEqual([]);
        expect(getDietConflicts('Brown rice', ['gluten-free'])).toEqual([]);
    });
});

describe('describeDietConflicts', () => {
    it('reads naturally', () => {
        expect(describeDietConflicts(['vegan'])).toBe('Not vegan');
        expect(describeDietConflicts(['vegetarian', 'gluten-free'])).toBe(
            'Not vegetarian or gluten-free',
        );
    });
});
