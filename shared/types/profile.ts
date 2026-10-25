import type { PlanTier } from '../plans.ts';

/* Daily goals; the planner and goal-aware recommendations aim for these. */
export type DailyTargets = {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
};

/* One eating period of the day, e.g. "Breakfast at 07:30, 25% of calories". */
export type MealSlotConfig = {
    id: string;
    label: string;
    time?: string; // HH:MM, 24h
    calorieShare: number; // % of daily calories; slots sum to ~100
};

export type UserProfile = {
    plan: PlanTier;
    trialEndsAt?: string; // ISO timestamp
    trialUsed: boolean;
    targets: DailyTargets;
    mealSlots: MealSlotConfig[];
};

// 2,000 kcal: ~24% protein, 45% carbs, 30% fat.
export const DEFAULT_TARGETS: DailyTargets = {
    calories: 2000,
    proteinG: 120,
    carbsG: 225,
    fatG: 67,
    fiberG: 30,
};

// Ids match the original fixed slots so existing plan entries still line up.
export const DEFAULT_MEAL_SLOTS: MealSlotConfig[] = [
    { id: 'breakfast', label: 'Breakfast', time: '07:30', calorieShare: 25 },
    { id: 'lunch', label: 'Lunch', time: '12:30', calorieShare: 30 },
    { id: 'snack', label: 'Snack', time: '15:30', calorieShare: 10 },
    { id: 'dinner', label: 'Dinner', time: '18:30', calorieShare: 35 },
];

export const DEFAULT_PROFILE: UserProfile = {
    plan: 'free',
    trialUsed: false,
    targets: DEFAULT_TARGETS,
    mealSlots: DEFAULT_MEAL_SLOTS,
};
