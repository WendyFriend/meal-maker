import { useState } from 'react';
import '@ncdai/react-wheel-picker/style.css';
import './Calories.css';

import {
    WheelPicker,
    WheelPickerWrapper,
    type WheelPickerOption,
} from '@ncdai/react-wheel-picker';
import BottomSheet from './BottomSheet';

type CaloriesProps = {
    value: number | undefined;
    onChange: (value: number | undefined) => void;
};

function Calories({ value, onChange }: CaloriesProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Numbers-only options; the field button label carries the "kcal" unit.
    const caloriesOptions: WheelPickerOption[] = [
        { label: 'No preference', value: 'none' },
        ...Array.from({ length: 19 }, (_, index) => {
            const calories = 100 + index * 50;
            return {
                label: String(calories),
                value: String(calories),
            };
        }),
    ];

    const selectedValue = value === undefined ? 'none' : String(value);

    // "No preference" otherwise "400 kcal" in the field button.
    const selectedLabel =
        value === undefined
            ? 'No preference'
            : `${value} kcal`;

    function onValueChange(value: string) {
        if (value === 'none') {
            onChange(undefined);
        } else {
            onChange(Number(value));
        }
    }

    return (
        <div className="calories">
            <h3>2. Set your calorie target</h3>

            <button
                type="button"
                className="calories-field"
                onClick={() => setIsOpen(true)}
            >
                <span className="calories-field-content">
                    <span className="calories-field-value">
                        {selectedLabel}
                    </span>

                    <span
                        className="calories-field-chevron"
                        aria-hidden="true"
                    />
                </span>
            </button>

            <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)}>
                <div className="calories-picker">
                    <WheelPickerWrapper className="calories-picker-wrapper">
                        <WheelPicker
                            options={caloriesOptions}
                            value={selectedValue}
                            onValueChange={onValueChange}
                            classNames={{
                                optionItem:
                                    'text-zinc-400 dark:text-zinc-500 data-disabled:opacity-40',
                                highlightWrapper:
                                    'bg-zinc-100 data-rwp-focused:ring-2 data-rwp-focused:ring-zinc-300 data-rwp-focused:ring-inset dark:data-rwp-focused:ring-zinc-600',
                                highlightItem: 'data-disabled:opacity-40',
                            }}
                        />
                    </WheelPickerWrapper>
                </div>
            </BottomSheet>
        </div>
    );
}

export default Calories;
