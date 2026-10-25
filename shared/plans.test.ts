import { describe, expect, it } from 'vitest';
import { getEffectiveTier, getTrialDaysLeft } from './plans.ts';

const now = new Date('2026-10-25T12:00:00Z');

describe('getEffectiveTier', () => {
    it('keeps free and pro as they are', () => {
        expect(getEffectiveTier('free', undefined, now)).toBe('free');
        expect(getEffectiveTier('pro', undefined, now)).toBe('pro');
    });

    it('drops an expired or dateless trial to free', () => {
        expect(getEffectiveTier('trial', '2026-10-30T00:00:00Z', now)).toBe(
            'trial',
        );
        expect(getEffectiveTier('trial', '2026-10-20T00:00:00Z', now)).toBe(
            'free',
        );
        expect(getEffectiveTier('trial', undefined, now)).toBe('free');
    });
});

describe('getTrialDaysLeft', () => {
    it('rounds partial days up and never goes negative', () => {
        expect(getTrialDaysLeft('2026-10-26T00:00:00Z', now)).toBe(1);
        expect(getTrialDaysLeft('2026-11-08T12:00:00Z', now)).toBe(14);
        expect(getTrialDaysLeft('2026-10-01T00:00:00Z', now)).toBe(0);
    });
});
