import { useState } from 'react';
import type { ProteinPreference } from '../../../App';

type ProteinProps = {
    preference: ProteinPreference;
    onPreferenceChange: (preference: ProteinPreference) => void;
};

/**
 * Selection Logic:

click unselected option
→ select it

click selected option
→ deselect it

click other option
→ switch selection

test cases:
- Neither selected → select grams
- Grams selected → click grams → none selected
- Grams selected → click percentage → percentage selected
- Change 40 → 50, switch to percentage, then back → 50 should still be there

*/

function Protein({ preference, onPreferenceChange }: ProteinProps) {
    const [gramsInput, setGramsInput] = useState<string>(
        preference ? String(preference.grams) : '40',
    );
    const [percentageInput, setPercentageInput] = useState<string>(
        preference ? String(preference.percentage) : '25',
    );

    function gramsEnabled(): boolean {
        if (!preference) {
            return false;
        }
        return preference.type === 'grams';
    }

    function percentageEnabled(): boolean {
        if (!preference) {
            return false;
        }
        return preference.type === 'percentage';
    }

    function handleGramsToggle() {
        if (preference?.type === 'grams') {
            onPreferenceChange(null);
            return;
        }

        onPreferenceChange({
            type: 'grams',
            grams: Number(gramsInput),
            percentage: Number(percentageInput),
        });
    }

    function handleGramsInputChange(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const numericValue = event.target.value.replace(/[^0-9]/g, '');
        setGramsInput(numericValue);
    }

    function handleGramsValueChange() {
        console.log('grams value change');

        if (preference && preference.type === 'grams') {
            const numericValue = Number(gramsInput);
            if (numericValue >= 0) {
                onPreferenceChange({
                    ...preference,
                    grams: numericValue,
                });
            }
        }
    }

    function handlePercentageToggle() {
        if (preference?.type === 'percentage') {
            onPreferenceChange(null);
            return;
        }

        onPreferenceChange({
            type: 'percentage',
            grams: Number(gramsInput),
            percentage: Number(percentageInput),
        });
    }

    function handlePercentageInputChange(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const numericValue = event.target.value.replace(/[^0-9]/g, '');
        setPercentageInput(numericValue);
    }

    function handlePercentageValueChange() {
        console.log('percentage value change');

        if (preference && preference.type === 'percentage') {
            const numericValue = Number(percentageInput);
            if (numericValue >= 0) {
                onPreferenceChange({
                    ...preference,
                    percentage: numericValue,
                });
            }
        }
    }

    const isGramsEnabled = gramsEnabled();
    const isPercentageEnabled = percentageEnabled();

    return (
        <div className="protein">
            <h2>Protein</h2>
            <div className="protein-option">
                <input
                    className="protein-checkbox"
                    type="checkbox"
                    checked={isGramsEnabled}
                    onChange={handleGramsToggle}
                />
                <input
                    className="protein-input"
                    type="text"
                    value={gramsInput}
                    onChange={handleGramsInputChange}
                    onBlur={handleGramsValueChange}
                    disabled={!isGramsEnabled}
                />
                <span>g</span>
            </div>
            <div className="protein-option">
                <input
                    className="protein-checkbox"
                    type="checkbox"
                    checked={isPercentageEnabled}
                    onChange={handlePercentageToggle}
                />
                <input
                    className="protein-input"
                    type="text"
                    value={percentageInput}
                    onChange={handlePercentageInputChange}
                    onBlur={handlePercentageValueChange}
                    disabled={!isPercentageEnabled}
                />
                <span>% of calories</span>
            </div>
        </div>
    );
}

export default Protein;
