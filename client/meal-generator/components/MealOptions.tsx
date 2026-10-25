import { useId, useState } from 'react';
import type { MealType } from '../../../shared/types/types';
import Protein from './Protein';
import './MealOptions.css';
import type { MealOptionsValue } from './mealOptionsValue';

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 6;

const mealTypes: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'snack', label: 'Snack' },
];

/* Short description of the chosen options, shown while collapsed. */
function summarize(options: MealOptionsValue): string {
    const parts: string[] = [];

    if (options.servings > 1) parts.push(`${options.servings} servings`);
    if (options.mealType) {
        parts.push(
            mealTypes.find((type) => type.value === options.mealType)?.label ??
                options.mealType,
        );
    }
    if (options.proteinPercentage !== undefined) {
        parts.push(`${options.proteinPercentage}% protein`);
    }
    return parts.join(' · ');
}

type MealOptionsProps = {
    value: MealOptionsValue;
    onChange: (value: MealOptionsValue) => void;
};

function MealOptions({ value, onChange }: MealOptionsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const panelId = useId();
    const summary = summarize(value);

    function update(changes: Partial<MealOptionsValue>) {
        onChange({ ...value, ...changes });
    }

    return (
        <section className="meal-options">
            <button
                type="button"
                className="meal-options-toggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setIsOpen((current) => !current)}
            >
                <span className="meal-options-toggle-copy">
                    <span className="meal-options-title">More options</span>
                    <span className="meal-options-summary">
                        {summary || 'Servings, meal type and protein'}
                    </span>
                </span>
                <span className="meal-options-chevron" aria-hidden="true" />
            </button>

            {isOpen && (
                <div className="meal-options-panel" id={panelId}>
                    <div className="meal-options-group">
                        <h4 className="meal-options-label">Servings</h4>
                        <div className="meal-options-stepper">
                            <button
                                type="button"
                                aria-label="Fewer servings"
                                disabled={value.servings <= MIN_SERVINGS}
                                onClick={() =>
                                    update({ servings: value.servings - 1 })
                                }
                            >
                                −
                            </button>
                            <output aria-label="Servings">
                                {value.servings}
                            </output>
                            <button
                                type="button"
                                aria-label="More servings"
                                disabled={value.servings >= MAX_SERVINGS}
                                onClick={() =>
                                    update({ servings: value.servings + 1 })
                                }
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="meal-options-group">
                        <h4 className="meal-options-label">
                            Meal type{' '}
                            <span className="meal-options-optional">
                                Optional
                            </span>
                        </h4>
                        <div className="meal-options-chips" role="group">
                            {mealTypes.map((type) => {
                                const selected = value.mealType === type.value;
                                return (
                                    <button
                                        key={type.value}
                                        type="button"
                                        className="meal-options-chip"
                                        aria-pressed={selected}
                                        onClick={() =>
                                            update({
                                                mealType: selected
                                                    ? undefined
                                                    : type.value,
                                            })
                                        }
                                    >
                                        {type.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="meal-options-group meal-options-protein">
                        <Protein
                            value={value.proteinPercentage}
                            onChange={(proteinPercentage) =>
                                update({ proteinPercentage })
                            }
                        />
                        <p className="meal-options-hint">
                            Share of the meal's calories from protein.
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}

export default MealOptions;
