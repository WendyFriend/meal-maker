import { useId, useRef, useState } from 'react';
import { PLAN_LIMITS } from '../../shared/plans';
import type {
    DailyTargets,
    MealSlotConfig,
    UserProfile,
} from '../../shared/types/profile';
import { usePlan } from '../plan/PlanContext';
import UpgradeNotice from '../plan/UpgradeNotice';
import { sortSlots } from './budget';
import {
    MAX_LABEL_LENGTH,
    SPLIT_PRESETS,
    TARGET_LABELS,
    TARGET_RANGES,
    balanceShares,
    getMacroSplit,
    gramsForSplit,
    newSlotId,
    parseWhole,
    validateTarget,
    type TargetKey,
} from './goalsMath';
import './Goals.css';

type TargetDraft = Record<TargetKey, string>;

type SlotDraft = {
    // Local key for React; `id` is the saved id (undefined until first save).
    key: string;
    id?: string;
    label: string;
    time: string;
    share: string;
};

type Status = { type: 'success' | 'error'; message: string } | null;

const TARGET_ORDER: TargetKey[] = [
    'calories',
    'proteinG',
    'carbsG',
    'fatG',
    'fiberG',
];

const TARGET_UNITS: Record<TargetKey, string> = {
    calories: 'kcal',
    proteinG: 'g',
    carbsG: 'g',
    fatG: 'g',
    fiberG: 'g',
};

function toTargetDraft(targets: DailyTargets): TargetDraft {
    return Object.fromEntries(
        TARGET_ORDER.map((key) => [key, String(targets[key])]),
    ) as TargetDraft;
}

function toSlotDrafts(slots: MealSlotConfig[]): SlotDraft[] {
    return sortSlots(slots).map((slot) => ({
        key: slot.id,
        id: slot.id,
        label: slot.label,
        time: slot.time ?? '',
        share: String(slot.calorieShare),
    }));
}

function isValidTime(time: string) {
    return time === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function validateSlot(slot: SlotDraft) {
    const share = parseWhole(slot.share);

    return {
        label: slot.label.trim() === '' ? 'Add a name' : null,
        time: isValidTime(slot.time) ? null : 'Use HH:MM',
        share: share === null || share < 0 || share > 100 ? 'Use 0–100' : null,
    };
}

function snapshot(targets: TargetDraft, slots: SlotDraft[]) {
    return JSON.stringify([
        targets,
        slots.map(({ id, label, time, share }) => [id, label, time, share]),
    ]);
}

type GoalsFormProps = {
    profile: UserProfile;
};

function GoalsForm({ profile }: GoalsFormProps) {
    const { limits, updateProfile } = usePlan();
    const formId = useId();
    const nextKey = useRef(0);
    const [targets, setTargets] = useState(() =>
        toTargetDraft(profile.targets),
    );
    const [slots, setSlots] = useState(() => toSlotDrafts(profile.mealSlots));
    const [baseline, setBaseline] = useState(() =>
        snapshot(
            toTargetDraft(profile.targets),
            toSlotDrafts(profile.mealSlots),
        ),
    );
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    const targetErrors = Object.fromEntries(
        TARGET_ORDER.map((key) => [key, validateTarget(key, targets[key])]),
    ) as Record<TargetKey, string | null>;
    const slotErrors = slots.map(validateSlot);
    const shareTotal = slots.reduce(
        (total, slot) => total + (parseWhole(slot.share) ?? 0),
        0,
    );
    const hasFieldErrors =
        TARGET_ORDER.some((key) => targetErrors[key]) ||
        slotErrors.some(
            (errors) => errors.label || errors.time || errors.share,
        );
    const isBalanced = shareTotal === 100;
    const isDirty = snapshot(targets, slots) !== baseline;
    const canSave = isDirty && !hasFieldErrors && isBalanced && !isSaving;

    const calories = parseWhole(targets.calories);
    const proteinG = parseWhole(targets.proteinG) ?? 0;
    const carbsG = parseWhole(targets.carbsG) ?? 0;
    const fatG = parseWhole(targets.fatG) ?? 0;
    const macroSplit = getMacroSplit(calories ?? 0, {
        proteinG,
        carbsG,
        fatG,
    });
    const caloriesValid = calories !== null && !targetErrors.calories;
    const macroGap =
        caloriesValid && calories > 0
            ? Math.round(((macroSplit.totalKcal - calories) / calories) * 100)
            : 0;
    const barTotal = Math.max(macroSplit.totalKcal, calories ?? 0, 1);

    const atSlotLimit = slots.length >= limits.mealSlots;
    const slotLimitIsPlanCap = limits.mealSlots < PLAN_LIMITS.pro.mealSlots;

    function editTarget(key: TargetKey, value: string) {
        setStatus(null);
        setTargets((current) => ({ ...current, [key]: value }));
    }

    function applyPreset(split: (typeof SPLIT_PRESETS)[number]['split']) {
        if (calories === null || !caloriesValid) return;

        const grams = gramsForSplit(calories, split);

        setStatus(null);
        setTargets((current) => ({
            ...current,
            proteinG: String(grams.proteinG),
            carbsG: String(grams.carbsG),
            fatG: String(grams.fatG),
        }));
    }

    function editSlot(key: string, change: Partial<SlotDraft>) {
        setStatus(null);
        setSlots((current) =>
            current.map((slot) =>
                slot.key === key ? { ...slot, ...change } : slot,
            ),
        );
    }

    function addSlot() {
        setStatus(null);
        setSlots((current) => [
            ...current,
            {
                key: `new-${nextKey.current++}`,
                label: `Meal ${current.length + 1}`,
                time: '',
                share: '10',
            },
        ]);
    }

    function removeSlot(key: string) {
        setStatus(null);
        setSlots((current) => current.filter((slot) => slot.key !== key));
    }

    function balance() {
        const balanced = balanceShares(
            slots.map((slot) => parseWhole(slot.share) ?? 0),
        );

        setStatus(null);
        setSlots((current) =>
            current.map((slot, index) => ({
                ...slot,
                share: String(balanced[index]),
            })),
        );
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!canSave) return;

        const nextTargets: DailyTargets = {
            calories: parseWhole(targets.calories) as number,
            proteinG: parseWhole(targets.proteinG) as number,
            carbsG: parseWhole(targets.carbsG) as number,
            fatG: parseWhole(targets.fatG) as number,
            fiberG: parseWhole(targets.fiberG) as number,
        };
        // Existing ids stay as they are so planned meals remain attached.
        const mealSlots = sortSlots(
            slots.map((slot) => ({
                id: slot.id ?? newSlotId(slot.label),
                label: slot.label.trim(),
                time: slot.time || undefined,
                calorieShare: parseWhole(slot.share) as number,
            })),
        );

        setIsSaving(true);
        setStatus(null);

        try {
            await updateProfile({ targets: nextTargets, mealSlots });

            const savedTargets = toTargetDraft(nextTargets);
            const savedSlots = toSlotDrafts(mealSlots);

            setTargets(savedTargets);
            setSlots(savedSlots);
            setBaseline(snapshot(savedTargets, savedSlots));
            setStatus({ type: 'success', message: 'Saved' });
        } catch (error) {
            console.error(error);
            setStatus({
                type: 'error',
                message: 'Could not save your changes. Please try again.',
            });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <form className="goals-form" onSubmit={handleSubmit} noValidate>
            <section
                className="goals-card app-card"
                aria-labelledby={`${formId}-targets`}
            >
                <header className="goals-card-header">
                    <h2 id={`${formId}-targets`}>Daily targets</h2>
                    <p>What a good day looks like for you.</p>
                </header>

                <div className="goals-fields">
                    {TARGET_ORDER.map((key) => {
                        const error = targetErrors[key];
                        const inputId = `${formId}-${key}`;
                        const { min, max } = TARGET_RANGES[key];

                        return (
                            <div
                                key={key}
                                className={`goals-field${
                                    key === 'calories'
                                        ? ' goals-field-wide'
                                        : ''
                                }`}
                            >
                                <label htmlFor={inputId}>
                                    {TARGET_LABELS[key]}
                                </label>
                                <div
                                    className={`goals-input${error ? ' goals-input-invalid' : ''}`}
                                >
                                    <input
                                        id={inputId}
                                        type="number"
                                        inputMode="numeric"
                                        min={min}
                                        max={max}
                                        step={1}
                                        value={targets[key]}
                                        onChange={(event) =>
                                            editTarget(key, event.target.value)
                                        }
                                        aria-invalid={error ? true : undefined}
                                        aria-describedby={
                                            error
                                                ? `${inputId}-error`
                                                : undefined
                                        }
                                    />
                                    <span>{TARGET_UNITS[key]}</span>
                                </div>
                                {error && (
                                    <p
                                        id={`${inputId}-error`}
                                        className="goals-field-error"
                                    >
                                        {error}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="goals-split">
                    <div
                        className="goals-split-bar"
                        role="img"
                        aria-label={`Macro split: ${macroSplit.protein}% protein, ${macroSplit.carbs}% carbs, ${macroSplit.fat}% fat`}
                    >
                        <span
                            className="goals-split-protein"
                            style={{
                                width: `${((proteinG * 4) / barTotal) * 100}%`,
                            }}
                        />
                        <span
                            className="goals-split-carbs"
                            style={{
                                width: `${((carbsG * 4) / barTotal) * 100}%`,
                            }}
                        />
                        <span
                            className="goals-split-fat"
                            style={{
                                width: `${((fatG * 9) / barTotal) * 100}%`,
                            }}
                        />
                    </div>
                    <ul className="goals-split-legend">
                        <li className="goals-split-protein">
                            Protein <strong>{macroSplit.protein}%</strong>
                        </li>
                        <li className="goals-split-carbs">
                            Carbs <strong>{macroSplit.carbs}%</strong>
                        </li>
                        <li className="goals-split-fat">
                            Fat <strong>{macroSplit.fat}%</strong>
                        </li>
                    </ul>
                    {caloriesValid && Math.abs(macroGap) >= 5 && (
                        <p className="goals-split-note">
                            Your macros add up to{' '}
                            {Math.round(macroSplit.totalKcal).toLocaleString(
                                'en',
                            )}{' '}
                            kcal, {Math.abs(macroGap)}%{' '}
                            {macroGap < 0 ? 'under' : 'over'} your calorie goal.
                        </p>
                    )}
                </div>

                <div className="goals-presets">
                    <span id={`${formId}-presets`}>Split by %</span>
                    <div role="group" aria-labelledby={`${formId}-presets`}>
                        {SPLIT_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="goals-preset"
                                disabled={!caloriesValid}
                                onClick={() => applyPreset(preset.split)}
                                title={`${preset.split.protein}% protein, ${preset.split.carbs}% carbs, ${preset.split.fat}% fat`}
                            >
                                {preset.label}
                                <small>
                                    {preset.split.protein}/{preset.split.carbs}/
                                    {preset.split.fat}
                                </small>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section
                className="goals-card app-card"
                aria-labelledby={`${formId}-slots`}
            >
                <header className="goals-card-header">
                    <h2 id={`${formId}-slots`}>Meal periods</h2>
                    <p>
                        When you eat, and how much of your day&apos;s calories
                        each period gets.
                    </p>
                </header>

                <ul className="goals-slots">
                    {slots.map((slot, index) => {
                        const errors = slotErrors[index];
                        const position = index + 1;

                        return (
                            <li key={slot.key} className="goals-slot">
                                <div className="goals-slot-field goals-slot-label">
                                    <input
                                        type="text"
                                        value={slot.label}
                                        maxLength={MAX_LABEL_LENGTH}
                                        placeholder="Name"
                                        aria-label={`Period ${position} name`}
                                        aria-invalid={
                                            errors.label ? true : undefined
                                        }
                                        onChange={(event) =>
                                            editSlot(slot.key, {
                                                label: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div className="goals-slot-field goals-slot-time">
                                    <input
                                        type="time"
                                        value={slot.time}
                                        aria-label={`Period ${position} time`}
                                        aria-invalid={
                                            errors.time ? true : undefined
                                        }
                                        onChange={(event) =>
                                            editSlot(slot.key, {
                                                time: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div
                                    className={`goals-slot-field goals-slot-share${errors.share ? ' goals-slot-field-invalid' : ''}`}
                                >
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={slot.share}
                                        aria-label={`Period ${position} share of calories`}
                                        aria-invalid={
                                            errors.share ? true : undefined
                                        }
                                        onChange={(event) =>
                                            editSlot(slot.key, {
                                                share: event.target.value,
                                            })
                                        }
                                    />
                                    <span>%</span>
                                </div>
                                <button
                                    type="button"
                                    className="goals-slot-remove"
                                    onClick={() => removeSlot(slot.key)}
                                    disabled={slots.length <= 1}
                                    aria-label={`Remove period ${position}${slot.label ? ` (${slot.label})` : ''}`}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <path d="M6 6l12 12M18 6L6 18" />
                                    </svg>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                <div className="goals-slots-footer">
                    <p
                        className={`goals-share-total${isBalanced ? ' goals-share-total-ok' : ''}`}
                        role="status"
                    >
                        Total {shareTotal}%
                        {!isBalanced && ' · periods should add up to 100%'}
                    </p>
                    <button
                        type="button"
                        className="goals-balance"
                        onClick={balance}
                        disabled={isBalanced}
                    >
                        Balance to 100%
                    </button>
                </div>

                {atSlotLimit ? (
                    slotLimitIsPlanCap ? (
                        <UpgradeNotice
                            feature="More meal periods"
                            description={`Your plan includes up to ${limits.mealSlots} periods a day.`}
                            compact
                        />
                    ) : (
                        <p className="goals-hint">
                            You&apos;re at the maximum of {limits.mealSlots}{' '}
                            meal periods.
                        </p>
                    )
                ) : (
                    <button
                        type="button"
                        className="goals-add-slot"
                        onClick={addSlot}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add meal period
                    </button>
                )}
            </section>

            <div className="goals-footer">
                <div className="goals-status">
                    {status?.type === 'success' && (
                        <p className="goals-status-success" role="status">
                            {status.message}
                        </p>
                    )}
                    {status?.type === 'error' && (
                        <p className="goals-status-error" role="alert">
                            {status.message}
                        </p>
                    )}
                    {!status && isDirty && (
                        <p className="goals-status-hint">Unsaved changes</p>
                    )}
                </div>
                <button
                    type="submit"
                    className="goals-save"
                    disabled={!canSave}
                >
                    {isSaving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </form>
    );
}

export default function Goals() {
    const { profile, isLoading } = usePlan();

    return (
        <main className="goals-page">
            <header className="list-page-header">
                <h1>Goals &amp; meal times</h1>
                <p>Daily targets and the periods your day is planned around</p>
            </header>

            {isLoading ? (
                <div
                    className="goals-loading"
                    role="status"
                    aria-label="Loading your goals"
                >
                    <div />
                    <div />
                </div>
            ) : (
                <GoalsForm profile={profile} />
            )}
        </main>
    );
}
