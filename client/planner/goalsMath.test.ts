import { describe, expect, it } from 'vitest';
import {
    balanceShares,
    getMacroSplit,
    gramsForSplit,
    newSlotId,
    slugify,
    validateTarget,
} from './goalsMath';

describe('gramsForSplit', () => {
    it('fills grams from calories', () => {
        expect(
            gramsForSplit(2000, { protein: 25, carbs: 45, fat: 30 }),
        ).toEqual({ proteinG: 125, carbsG: 225, fatG: 67 });
    });
});

describe('getMacroSplit', () => {
    it('reports each macro as a share of calories', () => {
        expect(
            getMacroSplit(2000, { proteinG: 125, carbsG: 225, fatG: 67 }),
        ).toMatchObject({ protein: 25, carbs: 45, fat: 30, totalKcal: 2003 });
    });
});

describe('validateTarget', () => {
    it('checks the same ranges as the database', () => {
        expect(validateTarget('calories', '799')).toMatch(/800/);
        expect(validateTarget('calories', '8001')).toMatch(/8000/);
        expect(validateTarget('calories', '800')).toBeNull();
        expect(validateTarget('proteinG', '601')).not.toBeNull();
        expect(validateTarget('carbsG', '1200')).toBeNull();
        expect(validateTarget('fiberG', '151')).not.toBeNull();
        expect(validateTarget('fatG', '')).toBe('Enter a number');
    });
});

describe('balanceShares', () => {
    it('scales to exactly 100', () => {
        expect(balanceShares([25, 30, 10, 20])).toEqual([29, 35, 12, 24]);
        expect(balanceShares([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    });

    it('splits evenly when everything is zero', () => {
        expect(balanceShares([0, 0, 0, 0])).toEqual([25, 25, 25, 25]);
    });
});

describe('newSlotId', () => {
    it('is a slug with a short suffix', () => {
        expect(slugify('Second Breakfast!')).toBe('second-breakfast');
        expect(slugify('???')).toBe('meal');
        expect(newSlotId('Late snack', () => 0.5)).toMatch(
            /^late-snack-[a-z0-9]{4}$/,
        );
    });
});
