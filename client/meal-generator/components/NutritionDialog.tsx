import { useEffect, useState } from 'react';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import './NutritionDialog.css';
import { NutritionField, type NutritionFieldConfig, type NutritionFieldId } from './NutritionField';

type NutritionValues = Record<NutritionFieldId, string>;

const nutritionFields: NutritionFieldConfig[] = [
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
        required: true,
    },
    {
        label: 'Fat',
        id: 'fatPer100g',
        unit: 'g',
        required: true,
    },
    {
        label: 'Sugar',
        id: 'sugarPer100g',
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

type NutritionDialogProps = {
    ingredientInfo: UserIngredient | IngredientInfo;
    onClose: () => void;
    onSave: (
        ingredient: UserIngredient | IngredientInfo,
        saveToUserIngredients: boolean,
    ) => Promise<void>;
};

function NutritionDialog({
    ingredientInfo,
    onClose,
    onSave,
}: NutritionDialogProps) {
    const [ingredientName, setIngredientName] = useState(ingredientInfo.name);

    const [nutritionValues, setNutritionValues] = useState<NutritionValues>({
        caloriesPer100g: String(ingredientInfo.caloriesPer100g ?? ''),
        proteinPer100g: String(ingredientInfo.proteinPer100g ?? ''),
        carbohydratePer100g: String(ingredientInfo.carbohydratePer100g ?? ''),
        fatPer100g: String(ingredientInfo.fatPer100g ?? ''),
        sugarPer100g: String(ingredientInfo.sugarPer100g ?? ''),
        saturatedFatPer100g: String(ingredientInfo.saturatedFatPer100g ?? ''),
        fiberPer100g: String(ingredientInfo.fiberPer100g ?? ''),
    });

    const [saveToUserIngredients, setSaveToUserIngredients] = useState(true);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    const isFieldMissing = (field: NutritionFieldConfig) =>
        field.required && nutritionValues[field.id].trim() === '';

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);

    function getUpdatedIngredient(): IngredientInfo | UserIngredient {
        const nutrition = nutritionFields.reduce<Partial<IngredientInfo>>(
            (current, field) => {
                const rawValue = nutritionValues[field.id].trim();

                if (rawValue === '') {
                    current[field.id] = undefined;
                    return current;
                }

                const value = Number(rawValue);

                if (Number.isFinite(value) && value >= 0) {
                    current[field.id] = value;
                }

                return current;
            },
            {},
        );

        return {
            ...ingredientInfo,
            ...nutrition,
            name: ingredientName.trim() || ingredientInfo.name,
        };
    }

    function saveIngredientName() {
        const name = ingredientName.trim() || ingredientInfo.name;
        setIngredientName(name);
    }

    function handleDone() {
        setHasSubmitted(true);

        const hasErrors = nutritionFields.some(isFieldMissing);

        if (hasErrors) {
            return;
        }
        onSave(getUpdatedIngredient(), saveToUserIngredients);
    }

    return (
        <div
            className="nutrition-dialog-backdrop"
            onMouseDown={() => {
                saveIngredientName();
                onClose();
            }}
        >
            <section
                className="nutrition-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Ingredient nutrition"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="nutrition-dialog-name">
                    <label>
                        <span className="name-field-input">
                            <input
                                className="ingredient-name-input"
                                type="text"
                                value={ingredientName}
                                onChange={(event) =>
                                    setIngredientName(event.target.value)
                                }
                                onBlur={saveIngredientName}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                    }
                                }}
                                aria-label="Ingredient name"
                            />
                        </span>
                    </label>
                </div>

                <p className="nutrition-dialog-description">
                    Nutrition per 100 g
                </p>

                <div className="nutrition-fields">
                    {nutritionFields.map((field) => (
                        <NutritionField
                            key={field.id}
                            fieldId={field.id}
                            fieldLabel={field.label}
                            fieldValue={nutritionValues[field.id]}
                            unit={field.unit}
                            required={field.required}
                            error={hasSubmitted && isFieldMissing(field)}
                            onChange={(fieldId, value) =>
                                setNutritionValues((values) => ({
                                    ...values,
                                    [fieldId]: value,
                                }))
                            }
                        />
                    ))}
                </div>

                <label className="save-ingredient-option">
                    <input
                        type="checkbox"
                        checked={saveToUserIngredients}
                        onChange={(event) =>
                            setSaveToUserIngredients(event.target.checked)
                        }
                    />
                    Save to Ingredients
                </label>

                <button
                    type="button"
                    className="nutrition-dialog-done"
                    onClick={handleDone}
                >
                    Done
                </button>
            </section>
        </div>
    );
}

export default NutritionDialog;
