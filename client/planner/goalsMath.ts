import type { DailyTargets } from '../../shared/types/profile';

export type TargetKey = keyof DailyTargets;

/* Ranges match the checks on the profiles table
   (supabase/migrations/20261025020000_profiles_planner_tiers.sql). */
export const TARGET_RANGES: Record<TargetKey, { min: number; max: number }> = {
    calories: { min: 800, max: 8000 },
    proteinG: { min: 0, max: 600 },
    carbsG: { min: 0, max: 1200 },
    fatG: { min: 0, max: 600 },
    fiberG: { min: 0, max: 150 },
};

export const TARGET_LABELS: Record<TargetKey, string> = {
    calories: 'Calories',
    proteinG: 'Protein',
    carbsG: 'Carbs',
    fatG: 'Fat',
    fiberG: 'Fibre',
};

export const MAX_LABEL_LENGTH = 24;

/* A macro split as % of calories (protein / carbs / fat). */
export type MacroSplit = { protein: number; carbs: number; fat: number };

export const SPLIT_PRESETS: { id: string; label: string; split: MacroSplit }[] =
    [
        {
            id: 'balanced',
            label: 'Balanced',
            split: { protein: 25, carbs: 45, fat: 30 },
        },
        {
            id: 'high-protein',
            label: 'High protein',
            split: { protein: 35, carbs: 35, fat: 30 },
        },
        {
            id: 'lower-carb',
            label: 'Lower carb',
            split: { protein: 30, carbs: 25, fat: 45 },
        },
    ];

/* Parses a whole number out of a form field; null when blank or invalid. */
export function parseWhole(text: string): number | null {
    if (text.trim() === '') return null;

    const value = Number(text);

    return Number.isFinite(value) ? Math.round(value) : null;
}

/* Error text for a target field, or null when it is fine. */
export function validateTarget(key: TargetKey, text: string): string | null {
    const value = parseWhole(text);
    const { min, max } = TARGET_RANGES[key];

    if (value === null) return 'Enter a number';
    if (value < min || value > max) return `Use ${min}–${max}`;

    return null;
}

/* Grams for a split of `calories` (protein and carbs 4 kcal/g, fat 9). */
export function gramsForSplit(
    calories: number,
    split: MacroSplit,
): Pick<DailyTargets, 'proteinG' | 'carbsG' | 'fatG'> {
    return {
        proteinG: Math.round((calories * split.protein) / 100 / 4),
        carbsG: Math.round((calories * split.carbs) / 100 / 4),
        fatG: Math.round((calories * split.fat) / 100 / 9),
    };
}

/* Each macro's energy as % of `calories`, and the macros' total kcal. */
export function getMacroSplit(
    calories: number,
    macros: Pick<DailyTargets, 'proteinG' | 'carbsG' | 'fatG'>,
) {
    const proteinKcal = macros.proteinG * 4;
    const carbsKcal = macros.carbsG * 4;
    const fatKcal = macros.fatG * 9;
    const totalKcal = proteinKcal + carbsKcal + fatKcal;
    const percent = (kcal: number) =>
        calories > 0 ? Math.round((kcal / calories) * 100) : 0;

    return {
        protein: percent(proteinKcal),
        carbs: percent(carbsKcal),
        fat: percent(fatKcal),
        totalKcal,
    };
}

/* Scales shares to add up to exactly 100 (largest remainder), or splits
   evenly when they are all zero. */
export function balanceShares(shares: number[]): number[] {
    if (shares.length === 0) return [];

    const clean = shares.map((share) => Math.max(0, share));
    const total = clean.reduce((sum, share) => sum + share, 0);
    const exact =
        total > 0
            ? clean.map((share) => (share / total) * 100)
            : clean.map(() => 100 / clean.length);
    const result = exact.map(Math.floor);
    let leftover = 100 - result.reduce((sum, share) => sum + share, 0);
    const byRemainder = exact
        .map((value, index) => ({
            index,
            remainder: value - Math.floor(value),
        }))
        .sort((a, b) => b.remainder - a.remainder);

    for (const { index } of byRemainder) {
        if (leftover <= 0) break;
        result[index] += 1;
        leftover -= 1;
    }

    return result;
}

/* "Second breakfast!" -> "second-breakfast" */
export function slugify(label: string) {
    return (
        label
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 24) || 'meal'
    );
}

/* Id for a new meal period: readable slug plus a short random suffix so
   two periods with the same name stay distinct. */
export function newSlotId(label: string, random = Math.random) {
    return `${slugify(label)}-${random().toString(36).slice(2, 6).padEnd(4, '0')}`;
}
