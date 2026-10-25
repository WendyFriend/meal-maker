/*
 * Subscription tiers. Free stays useful day to day (a few AI meals, a
 * short planning window, macros and key nutrients); Trial unlocks
 * everything for two weeks; Pro removes the caps.
 */

export type PlanTier = 'free' | 'trial' | 'pro';

export type PlanLimits = {
    // AI meal generations per calendar day.
    generationsPerDay: number;
    // null = unlimited.
    savedMeals: number | null;
    savedIngredients: number | null;
    // How far ahead the day planner can schedule (0 = today only).
    planningDaysAhead: number;
    // Custom meal periods per day (breakfast, lunch, ...).
    mealSlots: number;
    // Vitamins, minerals and fat breakdown (free shows the basics).
    fullNutrients: boolean;
    // "Higher protein" / "Lower calorie" regenerations.
    variations: boolean;
    // Copy a planned day/meal to other days, add a week to the shopping list.
    planReuseTools: boolean;
};

export const TRIAL_DAYS = 14;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
    free: {
        generationsPerDay: 5,
        savedMeals: 20,
        savedIngredients: 40,
        planningDaysAhead: 2,
        mealSlots: 4,
        fullNutrients: false,
        variations: false,
        planReuseTools: false,
    },
    trial: {
        generationsPerDay: 25,
        savedMeals: null,
        savedIngredients: null,
        planningDaysAhead: 30,
        mealSlots: 8,
        fullNutrients: true,
        variations: true,
        planReuseTools: true,
    },
    pro: {
        // Fair-use cap rather than a product limit.
        generationsPerDay: 100,
        savedMeals: null,
        savedIngredients: null,
        planningDaysAhead: 90,
        mealSlots: 8,
        fullNutrients: true,
        variations: true,
        planReuseTools: true,
    },
};

export const PLAN_LABELS: Record<PlanTier, string> = {
    free: 'Free',
    trial: 'Pro trial',
    pro: 'Pro',
};

/* An expired trial behaves like the free plan. */
export function getEffectiveTier(
    plan: PlanTier,
    trialEndsAt: string | undefined,
    now = new Date(),
): PlanTier {
    if (plan !== 'trial') return plan;
    if (!trialEndsAt) return 'free';

    return new Date(trialEndsAt) > now ? 'trial' : 'free';
}

/* Whole days left in a trial, rounded up; 0 once it has ended. */
export function getTrialDaysLeft(trialEndsAt: string, now = new Date()) {
    const ms = new Date(trialEndsAt).getTime() - now.getTime();

    return Math.max(0, Math.ceil(ms / 86_400_000));
}
