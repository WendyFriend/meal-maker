import { useState } from 'react';
import type { DailyTargets } from '../../shared/types/profile';
import {
    BASIC_NUTRIENT_KEYS,
    NUTRIENT_GROUP_LABELS,
    type Micronutrients,
    type NutrientGroup,
} from '../../shared/nutrition/nutrients';
import UpgradeNotice from '../plan/UpgradeNotice';
import { usePlan } from '../plan/PlanContext';
import {
    getNutrientProgress,
    getProgressTone,
    LOW_NUTRIENT_PERCENT,
    type NutrientProgress,
    type NutritionTotals,
} from './budget';
import ProgressRing from './ProgressRing';

type DaySummaryProps = {
    totals: NutritionTotals;
    micronutrients: Micronutrients;
    targets: DailyTargets;
    hasMeals: boolean;
    // Still on the starter goals; nudge towards setting real ones.
    usesDefaultGoals: boolean;
    onEditGoals: () => void;
};

const HIGHLIGHT_COUNT = 4;

function formatNumber(value: number) {
    return Math.round(value).toLocaleString('en');
}

function formatAmount(value: number) {
    if (value >= 100) return formatNumber(value);

    return String(Math.round(value * 10) / 10);
}

function MacroRow({
    label,
    value,
    target,
    tone,
    unit = 'g',
}: {
    label: string;
    value: number;
    target: number;
    tone: 'protein' | 'carbs' | 'fat' | 'fiber';
    unit?: string;
}) {
    const ratio = target > 0 ? value / target : 0;

    return (
        <div className={`macro-row macro-row-${tone}`}>
            <div className="macro-row-text">
                <span>{label}</span>
                <span>
                    <strong>{formatNumber(value)}</strong> /{' '}
                    {formatNumber(target)} {unit}
                </span>
            </div>
            <div
                className="macro-row-bar"
                role="progressbar"
                aria-label={`${label} progress`}
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={Math.round(value)}
            >
                <span
                    className={ratio > 1.1 ? 'macro-row-bar-over' : undefined}
                    style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                />
            </div>
        </div>
    );
}

function NutrientMeter({ item }: { item: NutrientProgress }) {
    const percent = item.percent ?? 0;

    if (!item.reported) {
        return (
            <li className="nutrient-meter nutrient-meter-unknown">
                <div className="nutrient-meter-text">
                    <span>{item.label}</span>
                    <span>No data</span>
                </div>
            </li>
        );
    }

    return (
        <li
            className={`nutrient-meter${
                item.limit ? ' nutrient-meter-limit' : ''
            }${percent > 100 && item.limit ? ' nutrient-meter-over' : ''}`}
        >
            <div className="nutrient-meter-text">
                <span>{item.label}</span>
                <span>
                    {formatAmount(item.amount)} {item.unit}
                    {item.percent !== undefined && (
                        <strong>
                            {' '}
                            · {item.percent}%{item.limit ? ' of limit' : ''}
                        </strong>
                    )}
                </span>
            </div>
            {item.percent !== undefined && (
                <div className="nutrient-meter-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
            )}
        </li>
    );
}

function NutrientHighlights({
    totals,
    micronutrients,
    targets,
}: Pick<DaySummaryProps, 'totals' | 'micronutrients' | 'targets'>) {
    const { limits } = usePlan();
    const [showAll, setShowAll] = useState(false);
    const progress = getNutrientProgress(totals, micronutrients, targets);
    const hasData = progress.some(
        (item) => item.key !== 'fiber' && item.reported,
    );

    if (!limits.fullNutrients) {
        const basics = progress.filter(
            (item) => BASIC_NUTRIENT_KEYS.includes(item.key) && item.reported,
        );

        return (
            <section className="day-summary-section" aria-label="Nutrients">
                <h3>Key nutrients</h3>
                {hasData ? (
                    <ul className="nutrient-list">
                        {basics.map((item) => (
                            <NutrientMeter key={item.key} item={item} />
                        ))}
                    </ul>
                ) : (
                    <p className="day-summary-hint">
                        Appears once your meals include USDA-matched
                        ingredients.
                    </p>
                )}
                <UpgradeNotice
                    feature="Vitamins & minerals"
                    description="See every nutrient your day is missing."
                    compact
                />
            </section>
        );
    }

    if (!hasData) {
        return (
            <section className="day-summary-section" aria-label="Nutrients">
                <h3>Nutrient highlights</h3>
                <p className="day-summary-hint">
                    Vitamins and minerals show up once your meals include
                    USDA-matched ingredients.
                </p>
            </section>
        );
    }

    // Furthest from target first; nutrients to keep under a limit aren't "low".
    const lowest = progress
        .filter(
            (item) =>
                !item.limit && item.percent !== undefined && item.reported,
        )
        .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
        .slice(0, HIGHLIGHT_COUNT);
    const groups = Object.keys(NUTRIENT_GROUP_LABELS) as NutrientGroup[];

    return (
        <section className="day-summary-section" aria-label="Nutrients">
            <h3>Nutrient highlights</h3>
            <p className="day-summary-hint">Furthest below target so far</p>
            <ul className="nutrient-list">
                {lowest.map((item) => (
                    <NutrientMeter key={item.key} item={item} />
                ))}
            </ul>
            {lowest.every(
                (item) => (item.percent ?? 0) >= LOW_NUTRIENT_PERCENT,
            ) && (
                <p className="day-summary-hint">
                    You&apos;re covering the bases.
                </p>
            )}
            <button
                type="button"
                className="day-summary-toggle"
                aria-expanded={showAll}
                onClick={() => setShowAll((current) => !current)}
            >
                {showAll ? 'Hide full breakdown' : 'Show full breakdown'}
            </button>
            {showAll &&
                groups.map((group) => (
                    <div key={group} className="nutrient-group">
                        <h4>{NUTRIENT_GROUP_LABELS[group]}</h4>
                        <ul className="nutrient-list nutrient-list-grid">
                            {progress
                                .filter((item) => item.group === group)
                                .map((item) => (
                                    <NutrientMeter key={item.key} item={item} />
                                ))}
                        </ul>
                    </div>
                ))}
        </section>
    );
}

export default function DaySummary({
    totals,
    micronutrients,
    targets,
    hasMeals,
    usesDefaultGoals,
    onEditGoals,
}: DaySummaryProps) {
    const remaining = Math.round(targets.calories - totals.calories);
    const tone = getProgressTone(totals.calories, targets.calories);

    return (
        <aside className="day-summary app-card" aria-label="Day summary">
            <header className="day-summary-header">
                <h2>Day summary</h2>
                <button
                    type="button"
                    className="day-summary-edit"
                    onClick={onEditGoals}
                >
                    Edit goals
                </button>
            </header>

            <div className="day-summary-calories">
                <ProgressRing
                    value={totals.calories}
                    max={targets.calories}
                    size={132}
                    strokeWidth={12}
                >
                    <strong>{formatNumber(totals.calories)}</strong>
                    <span>kcal planned</span>
                </ProgressRing>
                <div className="day-summary-calorie-text">
                    <span className="day-summary-target">
                        of {formatNumber(targets.calories)} kcal
                    </span>
                    <strong
                        className={`day-summary-left day-summary-left-${tone}`}
                    >
                        {remaining >= 0
                            ? `${formatNumber(remaining)} kcal left`
                            : `${formatNumber(-remaining)} kcal over`}
                    </strong>
                    {!hasMeals && (
                        <span className="day-summary-hint">
                            Nothing planned yet
                        </span>
                    )}
                </div>
            </div>

            <div className="macro-rows">
                <MacroRow
                    label="Protein"
                    tone="protein"
                    value={totals.proteinG}
                    target={targets.proteinG}
                />
                <MacroRow
                    label="Carbs"
                    tone="carbs"
                    value={totals.carbsG}
                    target={targets.carbsG}
                />
                <MacroRow
                    label="Fat"
                    tone="fat"
                    value={totals.fatG}
                    target={targets.fatG}
                />
                <MacroRow
                    label="Fibre"
                    tone="fiber"
                    value={totals.fiberG}
                    target={targets.fiberG}
                />
            </div>

            {usesDefaultGoals && (
                <p className="day-summary-nudge">
                    These are starter goals.{' '}
                    <button type="button" onClick={onEditGoals}>
                        Set your own
                    </button>
                </p>
            )}

            <NutrientHighlights
                totals={totals}
                micronutrients={micronutrients}
                targets={targets}
            />
        </aside>
    );
}
