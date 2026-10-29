import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKey, hashKey, takeToken, type ApiKey } from './keys.ts';

const key = (id: number, ratePerMinute: number): ApiKey => ({
    id,
    name: 'test',
    prefix: 'mm_dev_test',
    scopes: ['foods'],
    ratePerMinute,
});

afterEach(() => {
    vi.useRealTimers();
});

describe('generateKey', () => {
    it('labels the key and makes each one different', () => {
        const a = generateKey('dev');
        expect(a).toMatch(/^mm_dev_[A-Za-z0-9_-]{32}$/);
        expect(generateKey('live')).toMatch(/^mm_live_/);
        expect(generateKey('dev')).not.toBe(a);
    });

    it('stores a stable hash, never the key', () => {
        expect(hashKey('mm_dev_x')).toBe(hashKey('mm_dev_x'));
        expect(hashKey('mm_dev_x')).toMatch(/^[0-9a-f]{64}$/);
        expect(hashKey('mm_dev_x')).not.toBe(hashKey('mm_dev_y'));
    });
});

describe('takeToken', () => {
    it('allows the per-minute limit, then refuses with a retry time', () => {
        vi.useFakeTimers();
        const limited = key(1001, 3);
        expect([1, 2, 3].map(() => takeToken(limited).allowed)).toEqual([true, true, true]);

        const refused = takeToken(limited);
        expect(refused.allowed).toBe(false);
        expect(refused.resetSeconds).toBeGreaterThan(0);
        expect(refused.resetSeconds).toBeLessThanOrEqual(20);
    });

    it('refills over time', () => {
        vi.useFakeTimers();
        const limited = key(1002, 60);
        for (let i = 0; i < 60; i++) takeToken(limited);
        expect(takeToken(limited).allowed).toBe(false);

        vi.advanceTimersByTime(1000);
        expect(takeToken(limited).allowed).toBe(true);
    });

    it('keeps keys apart', () => {
        vi.useFakeTimers();
        takeToken(key(1003, 1));
        expect(takeToken(key(1003, 1)).allowed).toBe(false);
        expect(takeToken(key(1004, 1)).allowed).toBe(true);
    });
});
