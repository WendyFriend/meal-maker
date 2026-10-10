interface IngredientWeightInputProps {
    value: string;
    name: string;
    onChange: (value: string) => void;
    onBlur: () => void;
}

export const IngredientWeightInput = ({
    value,
    name,
    onChange,
    onBlur,
}: IngredientWeightInputProps) => {
    return (
        <input
            type="number"
            min="0"
            step="5"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            aria-label={`${name} weight in grams`}
        />
    );
};
