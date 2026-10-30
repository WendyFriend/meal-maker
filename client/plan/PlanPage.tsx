import { useEffect, useState } from 'react';
import {
    PLAN_LABELS,
    PLAN_LIMITS,
    TRIAL_DAYS,
    type PlanLimits,
    type PlanTier,
} from '../../shared/plans';
import { usePlan } from './PlanContext';
import { countRecipes } from '../services/recipeService';
import { getUserIngredients } from '../services/ingredientService';
import { resetDevGenerations } from '../services/usageService';
import './PlanPage.css';

type FeatureRow = {
    label: string;
    value: (limits: PlanLimits) => string | boolean;
};

const unlimited = (value: number | null) =>
    value === null ? 'Unlimited' : String(value);

const FEATURES: FeatureRow[] = [
    {
        label: 'AI meals per day',
        value: (limits) =>
            limits.generationsPerDay >= 100
                ? 'Unlimited*'
                : String(limits.generationsPerDay),
    },
    { label: 'Saved meals', value: (limits) => unlimited(limits.savedMeals) },
    {
        label: 'Saved ingredients',
        value: (limits) => unlimited(limits.savedIngredients),
    },
    {
        label: 'Plan ahead',
        value: (limits) =>
            limits.planningDaysAhead <= 2
                ? `Today + ${limits.planningDaysAhead} days`
                : `${limits.planningDaysAhead} days`,
    },
    {
        label: 'Meal periods per day',
        value: (limits) => String(limits.mealSlots),
    },
    {
        label: 'Nutrition detail',
        value: (limits) =>
            limits.fullNutrients
                ? 'Vitamins, minerals & fats'
                : 'Macros, fibre, sugar, salt',
    },
    {
        label: 'Higher-protein & lower-calorie remixes',
        value: (limits) => limits.variations,
    },
    {
        label: 'Copy meals across days, shop from your plan',
        value: (limits) => limits.planReuseTools,
    },
    { label: 'Nutrition database matching', value: () => true },
    { label: 'Preparation & food-safety notes', value: () => true },
];

const TIERS: PlanTier[] = ['free', 'trial', 'pro'];

const TIER_BLURBS: Record<PlanTier, string> = {
    free: 'Everyday meal ideas and a short planning window.',
    trial: `Everything in Pro for ${TRIAL_DAYS} days. No card needed.`,
    pro: 'Plan weeks ahead with the full nutrition picture.',
};

function UsageMeter({
    label,
    used,
    limit,
}: {
    label: string;
    used: number | undefined;
    limit: number | null;
}) {
    const percent =
        limit && used !== undefined ? Math.min(100, (used / limit) * 100) : 0;

    return (
        <div className="usage-meter">
            <div className="usage-meter-top">
                <span>{label}</span>
                <strong>
                    {used ?? '–'}
                    {limit !== null ? ` / ${limit}` : ''}
                </strong>
            </div>
            {limit !== null && (
                <div
                    className={`usage-meter-track${percent >= 100 ? ' usage-meter-full' : ''}`}
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={used ?? 0}
                >
                    <span style={{ width: `${percent}%` }} />
                </div>
            )}
        </div>
    );
}

export default function PlanPage({ reason }: { reason?: string }) {
    const {
        tier,
        limits,
        profile,
        trialDaysLeft,
        generationsToday,
        startTrial,
        switchTier,
    } = usePlan();
    const [savedMeals, setSavedMeals] = useState<number>();
    const [savedIngredients, setSavedIngredients] = useState<number>();
    const [status, setStatus] = useState<string | null>(null);
    const [isStartingTrial, setIsStartingTrial] = useState(false);

    useEffect(() => {
        countRecipes().then(setSavedMeals).catch(console.error);
        getUserIngredients()
            .then((ingredients) => setSavedIngredients(ingredients.length))
            .catch(console.error);
    }, []);

    const canStartTrial = tier === 'free' && !profile.trialUsed;

    async function handleStartTrial() {
        setIsStartingTrial(true);
        setStatus(null);
        try {
            await startTrial();
            setStatus(`Your ${TRIAL_DAYS}-day Pro trial has started.`);
        } catch (error) {
            console.error(error);
            setStatus('Could not start the trial. Please try again.');
        } finally {
            setIsStartingTrial(false);
        }
    }

    return (
        <main className="plan-page">
            <header className="list-page-header">
                <h1>Plan & usage</h1>
                <p>
                    You're on <strong>{PLAN_LABELS[tier]}</strong>
                    {trialDaysLeft !== undefined &&
                        ` · ${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left`}
                </p>
            </header>

            {reason && tier === 'free' && (
                <div className="plan-reason" role="status">
                    <strong>{reason}</strong> is part of Pro.{' '}
                    {canStartTrial
                        ? `Try everything free for ${TRIAL_DAYS} days.`
                        : 'Upgrade to unlock it.'}
                </div>
            )}

            <section className="plan-usage app-card" aria-label="Usage">
                <h2>Today's usage</h2>
                <div className="plan-usage-grid">
                    <UsageMeter
                        label="AI meals today"
                        used={generationsToday}
                        limit={
                            limits.generationsPerDay >= 100
                                ? null
                                : limits.generationsPerDay
                        }
                    />
                    <UsageMeter
                        label="Saved meals"
                        used={savedMeals}
                        limit={limits.savedMeals}
                    />
                    <UsageMeter
                        label="Saved ingredients"
                        used={savedIngredients}
                        limit={limits.savedIngredients}
                    />
                </div>
            </section>

            <section className="plan-tiers" aria-label="Plans">
                {TIERS.map((planTier) => {
                    const planLimits = PLAN_LIMITS[planTier];
                    const isCurrent = planTier === tier;

                    return (
                        <article
                            key={planTier}
                            className={`plan-tier plan-tier-${planTier}${isCurrent ? ' plan-tier-current' : ''}`}
                        >
                            <header>
                                <h2>{PLAN_LABELS[planTier]}</h2>
                                {isCurrent && (
                                    <span className="plan-tier-current-tag">
                                        Current
                                    </span>
                                )}
                            </header>
                            <p className="plan-tier-blurb">
                                {TIER_BLURBS[planTier]}
                            </p>

                            <ul className="plan-tier-features">
                                {FEATURES.map((feature) => {
                                    const value = feature.value(planLimits);

                                    return (
                                        <li
                                            key={feature.label}
                                            className={
                                                value === false
                                                    ? 'plan-feature-off'
                                                    : undefined
                                            }
                                        >
                                            <span
                                                className="plan-feature-mark"
                                                aria-hidden="true"
                                            >
                                                {value === false ? '–' : '✓'}
                                            </span>
                                            <span>
                                                {feature.label}
                                                {typeof value === 'string' && (
                                                    <strong>{value}</strong>
                                                )}
                                                {value === false && (
                                                    <span className="visually-hidden">
                                                        {' '}
                                                        (not included)
                                                    </span>
                                                )}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="plan-tier-action">
                                {isCurrent ? null : planTier === 'trial' ? (
                                    canStartTrial && (
                                        <button
                                            type="button"
                                            className="plan-button plan-button-primary"
                                            onClick={handleStartTrial}
                                            disabled={isStartingTrial}
                                        >
                                            {isStartingTrial
                                                ? 'Starting…'
                                                : `Start ${TRIAL_DAYS}-day trial`}
                                        </button>
                                    )
                                ) : planTier === 'pro' ? (
                                    <button
                                        type="button"
                                        className="plan-button"
                                        disabled
                                        title="Payments aren't set up yet"
                                    >
                                        Upgrade · coming soon
                                    </button>
                                ) : null}
                            </div>
                        </article>
                    );
                })}
            </section>

            <p className="plan-footnote">
                * Fair use: up to {PLAN_LIMITS.pro.generationsPerDay} AI meals a
                day. Preparation and food-safety notes are included on every
                plan.
            </p>

            {status && (
                <p className="plan-status" role="status">
                    {status}
                </p>
            )}

            {switchTier && (
                <section className="plan-dev app-card" aria-label="Dev tools">
                    <h2>Dev tools</h2>
                    <p>Switch the dev session's plan to test limits.</p>
                    <div className="plan-dev-options">
                        {TIERS.map((planTier) => (
                            <button
                                key={planTier}
                                type="button"
                                className="ingredient-filter-chip"
                                aria-pressed={planTier === tier}
                                onClick={() => switchTier(planTier)}
                            >
                                {PLAN_LABELS[planTier]}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="ingredient-filter-chip"
                            onClick={() => {
                                resetDevGenerations();
                                window.location.reload();
                            }}
                        >
                            Reset today's AI usage
                        </button>
                    </div>
                </section>
            )}
        </main>
    );
}
