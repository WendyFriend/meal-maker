import type { DietaryPreference } from '../../../shared/types/types';
import { DIET_LABELS } from '../../utils/diet';
import './DietSelector.css';

const DIET_OPTIONS: DietaryPreference[] = [
    'vegetarian',
    'vegan',
    'dairy-free',
    'gluten-free',
];

// Vegan already rules these out, so they show as included.
const IMPLIED_BY_VEGAN: DietaryPreference[] = ['vegetarian', 'dairy-free'];

type DietSelectorProps = {
    value: DietaryPreference[];
    onChange: (value: DietaryPreference[]) => void;
};

/*
 * Set before choosing ingredients, so suggestions and quick add can follow
 * it and anything that doesn't fit is flagged straight away.
 */
export default function DietSelector({ value, onChange }: DietSelectorProps) {
    const isVegan = value.includes('vegan');

    function toggle(diet: DietaryPreference) {
        if (value.includes(diet)) {
            onChange(value.filter((item) => item !== diet));
            return;
        }

        // Choosing vegan makes the implied diets redundant.
        const next =
            diet === 'vegan'
                ? value.filter((item) => !IMPLIED_BY_VEGAN.includes(item))
                : value;

        onChange([...next, diet]);
    }

    return (
        <div
            className="diet-selector"
            role="group"
            aria-labelledby="diet-label"
        >
            <span id="diet-label" className="diet-selector-label">
                Diet
            </span>

            <div className="diet-selector-options">
                {DIET_OPTIONS.map((diet) => {
                    const implied = isVegan && IMPLIED_BY_VEGAN.includes(diet);
                    const pressed = implied || value.includes(diet);

                    return (
                        <button
                            key={diet}
                            type="button"
                            className={`diet-chip ${pressed ? 'diet-chip-active' : ''} ${
                                implied ? 'diet-chip-implied' : ''
                            }`}
                            aria-pressed={pressed}
                            disabled={implied}
                            title={implied ? 'Included in vegan' : undefined}
                            onClick={() => toggle(diet)}
                        >
                            {pressed && (
                                <svg
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                            )}
                            {DIET_LABELS[diet]}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
