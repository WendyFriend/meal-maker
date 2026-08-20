import { useState } from 'react';
import '@ncdai/react-wheel-picker/style.css';
import './Calories.css';

import {
    WheelPicker,
    WheelPickerWrapper,
    type WheelPickerOption,
} from '@ncdai/react-wheel-picker';
import BottomSheet from './BottomSheet';
import Picker from './Picker';

function Calories() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedValue, setSelectedValue] = useState('none');
    const caloriesOptions: WheelPickerOption[] = [
        { label: 'No preference', value: 'none' },
        { label: '200 kcal', value: '200' },
        { label: '250 kcal', value: '250' },
        { label: '300 kcal', value: '300' },
        { label: '350 kcal', value: '350' },
        { label: '400 kcal', value: '400' },
        { label: '450 kcal', value: '450' },
        { label: '500 kcal', value: '500' },
        { label: '550 kcal', value: '550' },
        { label: '600 kcal', value: '600' },
        { label: '650 kcal', value: '650' },
        { label: '700 kcal', value: '700' },
        { label: '750 kcal', value: '750' },
        { label: '800 kcal', value: '800' },
        { label: '850 kcal', value: '850' },
        { label: '900 kcal', value: '900' },
        { label: '950 kcal', value: '950' },
        { label: '1000 kcal', value: '1000' },
    ];

    const selectedLabel = caloriesOptions.find(
        (op) => op.value === selectedValue,
    )?.label;

    return (
        <div className="calories">
            <h2>Calories</h2>
            <Picker
                value={selectedLabel}
                onClick={() => setIsOpen(true)}
            ></Picker>
            <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)}>
                <WheelPickerWrapper className="w-56 rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                    <WheelPicker
                        options={caloriesOptions}
                        value={selectedValue}
                        onValueChange={setSelectedValue}
                        classNames={{
                            optionItem:
                                'text-zinc-400 dark:text-zinc-500 data-disabled:opacity-40',
                            highlightWrapper:
                                'bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50 data-rwp-focused:ring-2 data-rwp-focused:ring-zinc-300 data-rwp-focused:ring-inset dark:data-rwp-focused:ring-zinc-600',
                            highlightItem: 'data-disabled:opacity-40',
                        }}
                    />
                </WheelPickerWrapper>
            </BottomSheet>
        </div>
    );
}

export default Calories;
