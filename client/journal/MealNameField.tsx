import { useLayoutEffect, useRef } from 'react';
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea';
import { useSaveOnLeave } from '../hooks/useSaveOnLeave';
import { revealAboveKeyboard } from '../utils/revealAboveKeyboard';

/**
 * A meal's name, changed in place in its row while the meal is edited: the
 * same type with an underline, focused with the caret at the end. Enter or a
 * tap elsewhere closes it (✓ saves it with the meal), Esc puts the name back;
 * line breaks become spaces.
 */
export default function MealNameField({
    value,
    placeholder = 'Meal name',
    onChange,
    onSave,
    onCancel,
}: {
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useAutoGrowTextarea(ref, true, value);
    useLayoutEffect(() => {
        const input = ref.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
    }, []);
    useSaveOnLeave({
        active: true,
        containers: () => [ref.current],
        onLeave: onSave,
    });

    return (
        <textarea
            ref={ref}
            className="journal-meal-name-input"
            aria-label="Meal name"
            placeholder={placeholder}
            rows={1}
            enterKeyHint="done"
            value={value}
            onFocus={(event) => revealAboveKeyboard(event.currentTarget, 0)}
            onChange={(event) =>
                onChange(event.target.value.replace(/\s*\n\s*/g, ' '))
            }
            onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onSave();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    onCancel();
                }
            }}
        />
    );
}
