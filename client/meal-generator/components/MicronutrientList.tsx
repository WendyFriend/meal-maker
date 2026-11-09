import { useId, useState, type ReactNode } from 'react';
import {
    MICRONUTRIENTS,
    type MicronutrientValues,
    type MicronutrientKey,
} from '../../../shared/micronutrients';
import { MICRONUTRIENT_INFORMATION } from './micronutrientInformation';
import MicronutrientContributors, {
    type MicronutrientContributions,
} from './MicronutrientContributors';
import './IngredientNutritionDetails.css';

export type MicronutrientEditor = {
    values: Partial<Record<MicronutrientKey, string>>;
    onChange: (key: MicronutrientKey, value: string) => void;
    disabled?: boolean;
};

function isAmount(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export default function MicronutrientList({
    amounts,
    basis = 'per 100 grams',
    contributions,
    editor,
    contributionScope,
    leadingItem,
}: {
    amounts: MicronutrientValues;
    contributionScope?: string;
    editor?: MicronutrientEditor;
    basis?: string;
    contributions?: MicronutrientContributions;
    leadingItem?: ReactNode;
}) {
    const [expandedNutrient, setExpandedNutrient] = useState<
        (typeof MICRONUTRIENTS)[number]['key'] | null
    >(null);
    const detailsId = useId();
    return (
        <ul className="ingredient-micronutrients">
            {leadingItem}
            {MICRONUTRIENTS.map(({ key, label, unit, dailyValue }) => {
                const inputValue =
                    editor?.values[key] ?? String(amounts[key] ?? '');
                const amount = editor
                    ? inputValue.trim() === ''
                        ? undefined
                        : Number(inputValue)
                    : amounts[key];
                const available = isAmount(amount);
                const percentage = available ? (amount / dailyValue) * 100 : 0;
                const percentageText =
                    percentage > 0 && percentage < 1
                        ? '<1%'
                        : `${Math.round(percentage)}%`;
                const expanded = expandedNutrient === key;
                const information = MICRONUTRIENT_INFORMATION[key];
                const informationId = `${detailsId}-${key}`;
                const contribution = contributions?.[key];
                const hasMissingData = Boolean(contribution?.missing.length);
                const trackContent = (
                    <>
                        <progress
                            max={100}
                            value={Math.min(100, percentage)}
                            aria-label={`${label} daily value ${basis}`}
                            aria-valuetext={`${percentageText} of Daily Value${hasMissingData ? ' from ingredients with available data' : ''}`}
                        />
                        <span aria-hidden="true">{percentageText} DV</span>
                    </>
                );
                return (
                    <li key={key}>
                        <div className="ingredient-micronutrient-label">
                            <button
                                type="button"
                                className="ingredient-micronutrient-trigger"
                                aria-expanded={expanded}
                                aria-controls={informationId}
                                onClick={() =>
                                    setExpandedNutrient(expanded ? null : key)
                                }
                            >
                                {label}
                                <svg viewBox="0 0 16 16" aria-hidden="true">
                                    <path d="m5 6 3 3 3-3" />
                                </svg>
                            </button>
                            {editor ? (
                                <label className="ingredient-inline-value">
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        aria-label={`${label} per 100 g (${unit})`}
                                        value={inputValue}
                                        disabled={editor.disabled}
                                        onChange={(event) =>
                                            editor.onChange(
                                                key,
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <span className="nutrition-facts-unit">
                                        {unit}
                                    </span>
                                </label>
                            ) : (
                                <span className="ingredient-micronutrient-value">
                                    <span>
                                        {available
                                            ? `${Number(amount.toFixed(2))} ${unit}`
                                            : 'N/A'}
                                    </span>
                                    {!available && hasMissingData && (
                                        <small>Missing</small>
                                    )}
                                </span>
                            )}
                        </div>
                        {contribution
                            ? (available || hasMissingData) && (
                                  <MicronutrientContributors
                                      label={label}
                                      scopeLabel={contributionScope}
                                      unit={unit}
                                      contribution={contribution}
                                      percentageText={
                                          available ? percentageText : 'N/A'
                                      }
                                      trigger={
                                          available ? (
                                              trackContent
                                          ) : (
                                              <span className="micronutrient-missing-trigger">
                                                  See missing ingredients
                                              </span>
                                          )
                                      }
                                  />
                              )
                            : available && (
                                  <div className="ingredient-micronutrient-track">
                                      {trackContent}
                                  </div>
                              )}
                        <div
                            id={informationId}
                            hidden={!expanded}
                            className="ingredient-micronutrient-explanation"
                        >
                            <p>{information.description}</p>
                            <a
                                href={information.source}
                                target="_blank"
                                rel="noreferrer"
                            >
                                NIH: about {label} ↗
                            </a>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
