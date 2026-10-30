import type { MicronutrientKey } from '../../../shared/micronutrients';
import NutritionInfo from './NutritionInfo';
import type { ReactNode } from 'react';
import './MicronutrientContributors.css';

export type NutrientContribution = {
    ingredients: { name: string; amount: number }[];
    missing: string[];
};
export type MicronutrientContributions = Partial<
    Record<MicronutrientKey, NutrientContribution>
>;

export default function MicronutrientContributors({
    label,
    unit,
    contribution,
    trigger,
    percentageText,
    scopeLabel = 'this meal',
}: {
    scopeLabel?: string;
    label: string;
    unit: string;
    contribution: NutrientContribution;
    trigger: ReactNode;
    percentageText: string;
}) {
    const top = contribution.ingredients.slice(0, 3);
    return (
        <NutritionInfo
            label={`${label}: ${percentageText} of Daily Value. Show contributing ingredients`}
            triggerClassName="ingredient-micronutrient-track micronutrient-contributors-track"
            trigger={trigger}
        >
            <div className="micronutrient-contributors">
                <h4>{label}</h4>
                <p className="micronutrient-contributors-caption">
                    {contribution.missing.length
                        ? `Top known contributors in ${scopeLabel}`
                        : `Top contributors in ${scopeLabel}`}
                </p>
                {top.length ? (
                    <ol>
                        {top.map(({ name, amount }) => (
                            <li key={name}>
                                <span>{name}</span>
                                <strong>
                                    {Number(amount.toPrecision(3))} {unit}
                                </strong>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="ingredient-details-note">
                        {contribution.missing.length
                            ? 'No contribution data is available yet.'
                            : 'No ingredient provides a measured amount of this nutrient.'}
                    </p>
                )}
                {contribution.ingredients.length > 3 && (
                    <p className="ingredient-details-note">
                        Showing the top 3 of {contribution.ingredients.length}{' '}
                        contributing ingredients.
                    </p>
                )}
                {contribution.missing.length > 0 && (
                    <p className="ingredient-details-note">
                        Data unavailable for: {contribution.missing.join(', ')}.
                        These ingredients are excluded from the ranking.
                    </p>
                )}
            </div>
        </NutritionInfo>
    );
}
