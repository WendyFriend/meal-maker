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
    const dailyValueLabel =
        percentageText === 'N/A'
            ? percentageText
            : `${percentageText} of Daily Value`;
    return (
        <NutritionInfo
            label={`${label}: ${dailyValueLabel}. Show contributing and missing ingredients`}
            triggerClassName="ingredient-micronutrient-track micronutrient-contributors-track"
            trigger={trigger}
        >
            <div className="micronutrient-contributors">
                <h4>{label}</h4>
                <p className="micronutrient-contributors-caption">
                    Top 3 contributors in {scopeLabel}
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
                {contribution.missing.length > 0 && (
                    <div className="micronutrient-missing-data">
                        <h5>Missing data</h5>
                        <p>{contribution.missing.join(', ')}</p>
                        <span>
                            These ingredients are excluded from the total above.
                        </span>
                    </div>
                )}
            </div>
        </NutritionInfo>
    );
}
