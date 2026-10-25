import { supabase } from '../lib/supabase';
import { getDevTier, isDevSessionActive, setDevTier } from '../auth/devAuth';
import { TRIAL_DAYS, type PlanTier } from '../../shared/plans';
import {
    DEFAULT_PROFILE,
    type DailyTargets,
    type MealSlotConfig,
    type UserProfile,
} from '../../shared/types/profile';

export type ProfileRow = {
    user_id: string;
    plan: PlanTier;
    trial_ends_at: string | null;
    trial_used: boolean;
    daily_calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    meal_slots: MealSlotConfig[];
};

export type ProfileUpdate = {
    targets?: DailyTargets;
    mealSlots?: MealSlotConfig[];
};

// Dev sessions keep targets and meal periods here; the tier comes from
// the dev session itself (see devAuth).
const DEV_PROFILE_KEY = 'mealmaker-dev-profile';

type DevProfile = Pick<UserProfile, 'targets' | 'mealSlots'> & {
    trialEndsAt?: string;
};

function readDevProfile(): DevProfile {
    try {
        const stored = JSON.parse(
            localStorage.getItem(DEV_PROFILE_KEY) ?? 'null',
        ) as Partial<DevProfile> | null;

        return {
            targets: { ...DEFAULT_PROFILE.targets, ...stored?.targets },
            mealSlots: stored?.mealSlots?.length
                ? stored.mealSlots
                : DEFAULT_PROFILE.mealSlots,
            trialEndsAt: stored?.trialEndsAt,
        };
    } catch {
        return {
            targets: DEFAULT_PROFILE.targets,
            mealSlots: DEFAULT_PROFILE.mealSlots,
        };
    }
}

function writeDevProfile(profile: DevProfile) {
    localStorage.setItem(DEV_PROFILE_KEY, JSON.stringify(profile));
}

function trialEndFromNow() {
    return new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
}

function getDevProfile(): UserProfile {
    const tier = getDevTier() ?? 'free';
    const stored = readDevProfile();

    // A dev "Trial" login always has a running trial.
    let trialEndsAt = stored.trialEndsAt;
    if (
        tier === 'trial' &&
        (!trialEndsAt || new Date(trialEndsAt) <= new Date())
    ) {
        trialEndsAt = trialEndFromNow();
        writeDevProfile({ ...stored, trialEndsAt });
    }

    return {
        plan: tier,
        trialEndsAt: tier === 'trial' ? trialEndsAt : undefined,
        trialUsed: tier !== 'free',
        targets: stored.targets,
        mealSlots: stored.mealSlots,
    };
}

export function toUserProfile(row: ProfileRow): UserProfile {
    return {
        plan: row.plan,
        trialEndsAt: row.trial_ends_at ?? undefined,
        trialUsed: row.trial_used,
        targets: {
            calories: row.daily_calories,
            proteinG: row.protein_g,
            carbsG: row.carbs_g,
            fatG: row.fat_g,
            fiberG: row.fiber_g,
        },
        mealSlots: row.meal_slots?.length
            ? row.meal_slots
            : DEFAULT_PROFILE.mealSlots,
    };
}

function toProfileValues(update: ProfileUpdate) {
    return {
        ...(update.targets && {
            daily_calories: Math.round(update.targets.calories),
            protein_g: Math.round(update.targets.proteinG),
            carbs_g: Math.round(update.targets.carbsG),
            fat_g: Math.round(update.targets.fatG),
            fiber_g: Math.round(update.targets.fiberG),
        }),
        ...(update.mealSlots && { meal_slots: update.mealSlots }),
    };
}

export async function getProfile(): Promise<UserProfile> {
    if (isDevSessionActive()) {
        return getDevProfile();
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (data) {
        return toUserProfile(data as ProfileRow);
    }

    // Accounts created before profiles existed: create one on first visit.
    const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({})
        .select()
        .single();

    if (insertError) {
        throw insertError;
    }

    return toUserProfile(created as ProfileRow);
}

export async function updateProfile(
    update: ProfileUpdate,
): Promise<UserProfile> {
    if (isDevSessionActive()) {
        const stored = readDevProfile();
        writeDevProfile({
            ...stored,
            ...(update.targets && { targets: update.targets }),
            ...(update.mealSlots && { mealSlots: update.mealSlots }),
        });
        return getDevProfile();
    }

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('Not signed in');
    }

    const { data, error } = await supabase
        .from('profiles')
        .update(toProfileValues(update))
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserProfile(data as ProfileRow);
}

/* Starts the one-off Pro trial (see start_trial() in the migration). */
export async function startTrial(): Promise<UserProfile> {
    if (isDevSessionActive()) {
        writeDevProfile({
            ...readDevProfile(),
            trialEndsAt: trialEndFromNow(),
        });
        setDevTier('trial');
        return getDevProfile();
    }

    const { data, error } = await supabase.rpc('start_trial');

    if (error) {
        throw error;
    }

    return toUserProfile(data as ProfileRow);
}

/* Dev-only plan switcher; real upgrades go through billing. */
export function switchDevTier(tier: PlanTier): UserProfile {
    if (tier === 'trial') {
        writeDevProfile({
            ...readDevProfile(),
            trialEndsAt: trialEndFromNow(),
        });
    }
    setDevTier(tier);
    return getDevProfile();
}
