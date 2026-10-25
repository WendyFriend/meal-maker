import { describe, expect, it } from 'vitest';
import {
    daysUntilExpiry,
    expiryTone,
    filterExpiringSoon,
    formatExpiry,
    formatPantrySummary,
    parsePantryInputs,
} from './pantry';

const today = new Date(2026, 9, 25, 15, 30); // 25 Oct 2026, afternoon

describe('pantry expiry helpers', () => {
    it('counts calendar days regardless of time of day', () => {
        expect(daysUntilExpiry('2026-10-25', today)).toBe(0);
        expect(daysUntilExpiry('2026-10-28', today)).toBe(3);
        expect(daysUntilExpiry('2026-10-24', today)).toBe(-1);
        expect(daysUntilExpiry(undefined, today)).toBeUndefined();
    });

    it('formats relative expiry text', () => {
        expect(formatExpiry('2026-10-28', today)).toBe('expires in 3 days');
        expect(formatExpiry('2026-10-26', today)).toBe('expires tomorrow');
        expect(formatExpiry('2026-10-25', today)).toBe('expires today');
        expect(formatExpiry('2026-10-24', today)).toBe('expired yesterday');
        expect(formatExpiry('2026-10-20', today)).toBe('expired 5 days ago');
    });

    it('formats a combined summary', () => {
        expect(
            formatPantrySummary(
                { quantity: 500, unit: 'g', expiresOn: '2026-10-28' },
                today,
            ),
        ).toBe('500 g · expires in 3 days');
        expect(formatPantrySummary({ quantity: 2, unit: 'pcs' }, today)).toBe(
            '2 pcs',
        );
        expect(formatPantrySummary({}, today)).toBeUndefined();
    });

    it('tints warning at 3 days or fewer and danger once expired', () => {
        expect(expiryTone('2026-10-28', today)).toBe('warning');
        expect(expiryTone('2026-10-29', today)).toBeUndefined();
        expect(expiryTone('2026-10-24', today)).toBe('danger');
        expect(expiryTone(undefined, today)).toBeUndefined();
    });

    it('filters to 7 days or expired, soonest first', () => {
        const items = [
            { name: 'a', expiresOn: '2026-11-10' },
            { name: 'b', expiresOn: '2026-11-01' },
            { name: 'c', expiresOn: '2026-10-20' },
            { name: 'd' },
            { name: 'e', expiresOn: '2026-11-02' },
            { name: 'f', expiresOn: '2026-10-30' },
        ];
        expect(filterExpiringSoon(items, today).map((i) => i.name)).toEqual([
            'c',
            'f',
            'b',
        ]);
    });

    it('parses form inputs, dropping blanks', () => {
        expect(
            parsePantryInputs({ quantity: '250', unit: 'ml', expiresOn: '' }),
        ).toEqual({ quantity: 250, unit: 'ml', expiresOn: undefined });
        expect(
            parsePantryInputs({
                quantity: '',
                unit: 'g',
                expiresOn: '2026-11-01',
            }),
        ).toEqual({
            quantity: undefined,
            unit: undefined,
            expiresOn: '2026-11-01',
        });
    });
});
