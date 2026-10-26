import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMobilePicker } from '../../hooks/useMobilePicker';
import '@ncdai/react-wheel-picker/style.css';
import './Calories.css';
import './MealFormField.css';

import { WheelPicker, WheelPickerWrapper } from '@ncdai/react-wheel-picker';
import BottomSheet from './BottomSheet';
import CalorieDropdown, { type CalorieOption } from './CalorieDropdown';

type CaloriesProps = {
    value: number | undefined;
    onChange: (value: number | undefined) => void;
};

// Numbers-only options; the field button label carries the "kcal" unit.
const caloriesOptions: CalorieOption[] = [
    { label: 'No preference', value: 'none' },
    ...Array.from({ length: 19 }, (_, index) => {
        const calories = 100 + index * 50;
        return {
            label: String(calories),
            value: String(calories),
        };
    }),
];

function Calories({ value, onChange }: CaloriesProps) {
    const [isOpen, setIsOpen] = useState(false);
    const mobile = useMobilePicker();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupId = useId();
    const close = useCallback(() => {
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        if (!mobile || !isOpen) return;
        function onEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        }
        window.addEventListener('keydown', onEscape);
        return () => window.removeEventListener('keydown', onEscape);
    }, [mobile, isOpen, close]);

    const selectedValue = value === undefined ? 'none' : String(value);

    const selectedLabel = value === undefined ? 'e.g. 600' : String(value);

    function onValueChange(value: string) {
        onChange(value === 'none' ? undefined : Number(value));
    }

    return (
        <div className="calories">
            <div className="calories-heading">
                <h2>2. Calorie goal</h2>
                <span className="calories-optional">Optional</span>
            </div>
            <p className="calories-hint">if you have one</p>

            <button
                type="button"
                ref={triggerRef}
                className="calories-field meal-form-field"
                aria-label={
                    value === undefined
                        ? 'Calorie goal, no preference'
                        : `Calorie goal, ${value} kcal`
                }
                aria-haspopup={mobile ? 'dialog' : 'listbox'}
                aria-expanded={isOpen}
                aria-controls={isOpen ? popupId : undefined}
                onClick={() => setIsOpen((current) => !current)}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setIsOpen(true);
                    }
                }}
            >
                <span className="calories-field-content">
                    <span
                        className={`calories-field-value ${value === undefined ? 'calories-field-placeholder' : ''}`}
                    >
                        {selectedLabel}
                    </span>
                    <span className="calories-field-unit">kcal</span>
                    <span
                        className="calories-field-chevron"
                        aria-hidden="true"
                    />
                </span>
            </button>

            {!mobile && isOpen && (
                <CalorieDropdown
                    id={popupId}
                    triggerRef={triggerRef}
                    options={caloriesOptions}
                    value={selectedValue}
                    onSelect={(nextValue) => {
                        onValueChange(nextValue);
                        close();
                    }}
                    onClose={close}
                />
            )}
            {mobile && (
                <BottomSheet
                    isOpen={isOpen}
                    onClose={close}
                    className="calories-sheet"
                >
                    <div
                        id={popupId}
                        className="calories-picker"
                        role={isOpen ? 'dialog' : undefined}
                        aria-label={isOpen ? 'Calorie goal' : undefined}
                    >
                        <WheelPickerWrapper className="calories-picker-wrapper">
                            <WheelPicker
                                optionItemHeight={44}
                                visibleCount={12}
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
            )}
        </div>
    );
}

export default Calories;
