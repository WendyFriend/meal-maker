import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    PLAN_LIMITS,
    getEffectiveTier,
    getTrialDaysLeft,
    type PlanLimits,
    type PlanTier,
} from '../../shared/plans';
import { DEFAULT_PROFILE, type UserProfile } from '../../shared/types/profile';
import {
    getProfile,
    startTrial as startTrialInDB,
    switchDevTier,
    updateProfile as updateProfileInDB,
    type ProfileUpdate,
} from '../services/profileService';
import {
    getGenerationsToday,
    recordGeneration as recordGenerationInDB,
} from '../services/usageService';
import { isDevSessionActive } from '../auth/devAuth';

type PlanContextValue = {
    profile: UserProfile;
    isLoading: boolean;
    // Effective tier: an expired trial is 'free'.
    tier: PlanTier;
    limits: PlanLimits;
    trialDaysLeft?: number;
    generationsToday: number;
    generationsLeft: number;
    canGenerate: boolean;
    // Call after each successful AI generation.
    recordGeneration: () => Promise<void>;
    updateProfile: (update: ProfileUpdate) => Promise<void>;
    startTrial: () => Promise<void>;
    // Opens the Plans page, optionally saying which feature prompted it.
    openPlans: (reason?: string) => void;
    // Dev sessions only.
    switchTier?: (tier: PlanTier) => void;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

type PlanProviderProps = {
    // Signed-in user; the profile reloads when it changes.
    userId: string;
    onOpenPlans: (reason?: string) => void;
    children: ReactNode;
};

export function PlanProvider({
    userId,
    onOpenPlans,
    children,
}: PlanProviderProps) {
    const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [generationsToday, setGenerationsToday] = useState(0);

    useEffect(() => {
        let cancelled = false;

        Promise.all([getProfile(), getGenerationsToday()])
            .then(([loadedProfile, generations]) => {
                if (cancelled) return;
                setProfile(loadedProfile);
                setGenerationsToday(generations);
            })
            .catch((error) => {
                // Missing migration or offline: keep free-plan defaults.
                console.error('Could not load profile:', error);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [userId]);

    const tier = getEffectiveTier(profile.plan, profile.trialEndsAt);
    const limits = PLAN_LIMITS[tier];
    const generationsLeft = Math.max(
        0,
        limits.generationsPerDay - generationsToday,
    );

    const recordGeneration = useCallback(async () => {
        setGenerationsToday((count) => count + 1);
        try {
            await recordGenerationInDB();
        } catch (error) {
            console.error('Could not record generation:', error);
        }
    }, []);

    const updateProfile = useCallback(async (update: ProfileUpdate) => {
        setProfile(await updateProfileInDB(update));
    }, []);

    const startTrial = useCallback(async () => {
        setProfile(await startTrialInDB());
    }, []);

    const value: PlanContextValue = {
        profile,
        isLoading,
        tier,
        limits,
        trialDaysLeft:
            tier === 'trial' && profile.trialEndsAt
                ? getTrialDaysLeft(profile.trialEndsAt)
                : undefined,
        generationsToday,
        generationsLeft,
        canGenerate: generationsLeft > 0,
        recordGeneration,
        updateProfile,
        startTrial,
        openPlans: onOpenPlans,
        switchTier: isDevSessionActive()
            ? (nextTier) => setProfile(switchDevTier(nextTier))
            : undefined,
    };

    return (
        <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
    );
}

// Outside a provider (component tests) nothing is gated.
const UNGATED: PlanContextValue = {
    profile: { ...DEFAULT_PROFILE, plan: 'pro' },
    isLoading: false,
    tier: 'pro',
    limits: PLAN_LIMITS.pro,
    generationsToday: 0,
    generationsLeft: PLAN_LIMITS.pro.generationsPerDay,
    canGenerate: true,
    recordGeneration: async () => {},
    updateProfile: async () => {},
    startTrial: async () => {},
    openPlans: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanContextValue {
    return useContext(PlanContext) ?? UNGATED;
}
