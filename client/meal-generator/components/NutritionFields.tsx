// import type { IngredientInfo } from '../types';

import type { IngredientInfo } from "../../../shared/types/types";

export type NutritionFieldId =
    | 'caloriesPer100g'
    | 'proteinPer100g'
    | 'carbohydratePer100g'
    | 'fatPer100g'
    | 'saturatedFatPer100g'
    | 'fiberPer100g';

export type NutritionField = {
    label: string;
    id: NutritionFieldId;
    unit: string;
    required: boolean;
};

const nutritionFields: NutritionField[] = [
    {
        label: 'Calories',
        id: 'caloriesPer100g',
        unit: 'kcal',
        required: true,
    },
    {
        label: 'Protein',
        id: 'proteinPer100g',
        unit: 'g',
        required: true,
    },
    {
        label: 'Carbohydrate',
        id: 'carbohydratePer100g',
        unit: 'g',
        required: false,
    },
    {
        label: 'Fat',
        id: 'fatPer100g',
        unit: 'g',
        required: false,
    },
    {
        label: 'Saturated fat',
        id: 'saturatedFatPer100g',
        unit: 'g',
        required: false,
    },
    {
        label: 'Fiber',
        id: 'fiberPer100g',
        unit: 'g',
        required: false,
    },
];

type NutritionFieldsProps = {
    ingredient: IngredientInfo;
    onChange: (field: NutritionFieldId, value: number | undefined) => void;
};

function NutritionFields({ ingredient, onChange }: NutritionFieldsProps) {
    return (
        <div className="nutrition-fields">
            {nutritionFields.map((field) => (
                <label key={field.id}>
                    {field.label} / 100g
                    <div className="nutrition-field-input">
                        <input
                            type="number"
                            min="0"
                            value={ingredient[field.id] ?? ''}
                            onChange={(e) => {
                                const value = e.target.value;

                                onChange(
                                    field.id,
                                    value === '' ? undefined : Number(value),
                                );
                            }}
                            required={field.required}
                        />

                        <span>{field.unit}</span>
                    </div>
                </label>
            ))}
        </div>
    );
}

export default NutritionFields;
