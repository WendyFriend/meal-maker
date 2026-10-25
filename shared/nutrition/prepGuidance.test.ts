import { describe, expect, it } from 'vitest';
import {
    formatConsiderationsForPrompt,
    getPrepConsiderations,
} from './prepGuidance.ts';

const ids = (names: string[]) =>
    getPrepConsiderations(names).map((consideration) => consideration.id);

describe('getPrepConsiderations', () => {
    it('requires dried kidney beans to be boiled hard', () => {
        const [first] = getPrepConsiderations(['Kidney beans']);

        expect(first.id).toBe('kidney-beans');
        expect(first.severity).toBe('required');
        expect(first.steps.join(' ')).toMatch(/boil hard/i);
    });

    it('treats canned beans as already cooked', () => {
        expect(ids(['Canned kidney beans'])).toEqual(['canned-legumes']);
    });

    it('suggests blanching spinach for oxalates', () => {
        const [spinach] = getPrepConsiderations(['Baby spinach']);

        expect(spinach.id).toBe('oxalate-greens');
        expect(spinach.compounds).toContain('oxalates');
    });

    it('matches plurals but not other words that contain the keyword', () => {
        expect(ids(['Eggs'])).toContain('eggs');
        expect(ids(['Eggplant'])).not.toContain('eggs');
        expect(ids(['Potatoes'])).toContain('potatoes');
        expect(ids(['Sweet potato'])).not.toContain('potatoes');
        expect(ids(['Steak'])).not.toContain('tea-coffee');
        expect(ids(['Green beans'])).toEqual(['green-beans']);
    });

    it('lists required guidance first and names the matching ingredients', () => {
        const considerations = getPrepConsiderations([
            'Brown rice',
            'Chicken breast',
            'Spinach',
        ]);

        expect(considerations[0]).toMatchObject({
            id: 'poultry',
            ingredients: ['Chicken breast'],
        });
        expect(considerations.map((c) => c.id)).toEqual(
            expect.arrayContaining(['oxalate-greens', 'whole-grains', 'rice']),
        );
    });

    it('returns nothing for ingredients without special handling', () => {
        expect(getPrepConsiderations(['Olive oil', 'Banana'])).toEqual([]);
    });
});

describe('formatConsiderationsForPrompt', () => {
    it('includes required and recommended steps but not tips', () => {
        const text = formatConsiderationsForPrompt(
            getPrepConsiderations(['Kidney beans', 'Kale']),
        );

        expect(text).toContain('REQUIRED');
        expect(text).toMatch(/Kidney beans/);
        expect(text).not.toMatch(/Kale/);
    });
});
