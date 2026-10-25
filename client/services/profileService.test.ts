import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startDevSession } from '../auth/devAuth';
import {
    getProfile,
    startTrial,
    switchDevTier,
    updateProfile,
} from './profileService';
import { DEFAULT_TARGETS } from '../../shared/types/profile';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

beforeEach(() => {
    localStorage.clear();
});

describe('dev profiles', () => {
    it('takes the plan from the dev login tier', async () => {
        startDevSession('free');
        expect((await getProfile()).plan).toBe('free');

        startDevSession('trial');
        const trial = await getProfile();
        expect(trial.plan).toBe('trial');
        expect(new Date(trial.trialEndsAt!).getTime()).toBeGreaterThan(
            Date.now(),
        );
    });

    it('keeps targets and meal periods across tier switches', async () => {
        startDevSession('free');
        await updateProfile({
            targets: { ...DEFAULT_TARGETS, calories: 1800 },
        });

        const pro = switchDevTier('pro');

        expect(pro.plan).toBe('pro');
        expect(pro.targets.calories).toBe(1800);
        expect(pro.mealSlots.length).toBeGreaterThan(0);
    });

    it('starts a trial from free', async () => {
        startDevSession('free');

        const profile = await startTrial();

        expect(profile.plan).toBe('trial');
        expect(profile.trialUsed).toBe(true);
    });
});
