import "./NutritionField.css";

export type NutritionFieldId =
    | 'caloriesPer100g'
    | 'proteinPer100g'
    | 'carbohydratePer100g'
    | 'fatPer100g'
    | 'sugarPer100g'
    | 'saturatedFatPer100g'
    | 'fiberPer100g';

export type NutritionFieldConfig = {
    label: string;
    id: NutritionFieldId;
    unit: string;
    required: boolean;
};

type NutritionFieldProps = {
    fieldId: NutritionFieldId;
    fieldLabel: string;
    fieldValue: string;
    unit: string;
    required?: boolean;
    error?: boolean;
    onChange: (field: NutritionFieldId, value: string) => void;
};

export function NutritionField({
    fieldId,
    fieldLabel,
    fieldValue,
    unit,
    required = false,
    error = false,
    onChange,
}: NutritionFieldProps) {
    const handleChange = (value: string) => {
        // 2 decimal places
        if (/^\d*\.?\d{0,2}$/.test(value)) {
            onChange(fieldId, value);
        }
    };

    return (
        <label
            className={`nutrition-field ${error ? 'nutrition-field-error' : ''}`}
        >
            <span>
                {fieldLabel}
                {required && (
                    <span className="required-marker" aria-hidden="true">
                        {' '}
                        *
                    </span>
                )}
            </span>

            <div className="nutrition-field-input input-underline">
                <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={fieldValue}
                    onChange={(event) => handleChange(event.target.value)}
                    required={required}
                    aria-invalid={error}
                />

                <span>{unit}</span>
            </div>
        </label>
    );
}
