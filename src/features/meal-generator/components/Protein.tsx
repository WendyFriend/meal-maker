import { useState } from 'react';
import '@ncdai/react-wheel-picker/style.css';
import './Protein.css';

import {
    WheelPicker,
    WheelPickerWrapper,
    type WheelPickerOption,
} from '@ncdai/react-wheel-picker';

function Protein() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedValue, setSelectedValue] = useState('none');
    const proteinOptions: WheelPickerOption[] = [
        { label: 'No preference', value: 'none' },
        { label: '0%', value: '0' },
        { label: '10%', value: '10' },
        { label: '20%', value: '20' },
        { label: '30%', value: '30' },
        { label: '40%', value: '40' },
        { label: '50%', value: '50' },
        { label: '60%', value: '60' },
        { label: '70%', value: '70' },
        { label: '80%', value: '80' },
        { label: '90%', value: '90' },
        { label: '100%', value: '100' },
    ];

    const selectedLabel = proteinOptions.find(
        (op) => op.value === selectedValue,
    )?.label;

    return (
        <div className="protein">
            <h2>
                <label htmlFor="protein-picker">Protein</label>
            </h2>
            <button
                id="protein-picker"
                type="button"
                className="protein-selector"
                onClick={() => setIsOpen(true)}
            >
                <span>{selectedLabel}</span>
                <span className="protein-selector-icon">⌄</span>
            </button>

            <div
                className={`protein-backdrop ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(false)}
            >
                <div
                    className="protein-sheet"
                    onClick={(event) => event.stopPropagation()}
                >
                    <WheelPickerWrapper className="w-56 rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                        <WheelPicker
                            options={proteinOptions}
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
                </div>
            </div>
        </div>
    );
}

export default Protein;
