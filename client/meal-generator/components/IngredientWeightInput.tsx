interface IngredientWeightInputProps {
    value: string;
    name: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    /** Enter moves on (e.g. to the next ingredient) instead of closing. */
    onEnter?: () => void;
    onFocus?: (input: HTMLInputElement) => void;
}

export const IngredientWeightInput = ({
    value,
    name,
    onChange,
    onBlur,
    onEnter,
    onFocus,
}: IngredientWeightInputProps) => {
    return (
        <input
            type="number"
            min="0"
            step="5"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            onFocus={(event) => onFocus?.(event.currentTarget)}
            enterKeyHint={onEnter ? 'next' : undefined}
            onKeyDown={(event) => {
                if (!onEnter || event.key !== 'Enter') return;
                event.preventDefault();
                onEnter();
            }}
            aria-label={`${name} weight in grams`}
        />
    );
};
