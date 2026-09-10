import { useEffect, useState } from 'react';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import './NutritionDialog.css';

type NutritionField = Exclude<keyof IngredientInfo, 'name' | 'ingredientId'>;

const nutritionFields: Array<{
    name: NutritionField;
    label: string;
    unit: string;
}> = [
    { name: 'caloriesPer100g', label: 'Calories', unit: 'kcal' },
    { name: 'proteinPer100g', label: 'Protein', unit: 'g' },
    { name: 'carbohydratePer100g', label: 'Carbs', unit: 'g' },
    { name: 'fatPer100g', label: 'Fat', unit: 'g' },
    { name: 'saturatedFatPer100g', label: 'Saturated Fat', unit: 'g' },
    { name: 'fiberPer100g', label: 'Fiber', unit: 'g' },
];

type NutritionDialogProps = {
    ingredientInfo: UserIngredient;
    onClose: () => void;
    onSave: (
        ingredient: UserIngredient,
        saveToUserIngredients: boolean,
    ) => void;
};

function NutritionDialog({
    ingredientInfo,
    onClose,
    onSave,
}: NutritionDialogProps) {
    const [ingredientName, setIngredientName] = useState(ingredientInfo.name);
    const [isEditingIngredientName, setIsEditingIngredientName] =
        useState(false);
    const [nutritionValues, setNutritionValues] = useState<
        Record<NutritionField, string>
    >({
        caloriesPer100g: String(ingredientInfo?.caloriesPer100g ?? ''),
        proteinPer100g: String(ingredientInfo?.proteinPer100g ?? ''),
        carbohydratePer100g: String(ingredientInfo?.carbohydratePer100g ?? ''),
        fatPer100g: String(ingredientInfo?.fatPer100g ?? ''),
        saturatedFatPer100g: String(ingredientInfo?.saturatedFatPer100g ?? ''),
        fiberPer100g: String(ingredientInfo?.fiberPer100g ?? ''),
    });
    const [saveToUserIngredients, setSaveToUserIngredients] = useState(true);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [onClose]);

    function getUpdatedIngredient() {
        const nutrition = nutritionFields.reduce<Partial<IngredientInfo>>(
            (current, field) => {
                const rawValue = nutritionValues[field.name].trim();
                const value = Number(rawValue);

                if (rawValue !== '' && Number.isFinite(value) && value >= 0) {
                    current[field.name] = value;
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
        setIsEditingIngredientName(false);
    }

    function handleDone() {
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
                {isEditingIngredientName ? (
                    <input
                        className="ingredient-name-heading"
                        type="text"
                        aria-label="Ingredient name"
                        autoFocus
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
                    />
                ) : (
                    <button
                        type="button"
                        className="ingredient-name-heading"
                        onClick={() => setIsEditingIngredientName(true)}
                        aria-label={`Edit ingredient name, ${ingredientName}`}
                    >
                        {ingredientName}
                    </button>
                )}
                <p className="nutrition-dialog-description">
                    Nutrition per 100 g
                </p>

                <div className="nutrition-fields">
                    {nutritionFields.map((field) => (
                        <label key={field.name}>
                            <span>{field.label}</span>
                            <span className="nutrition-field-input">
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    inputMode="decimal"
                                    value={nutritionValues[field.name]}
                                    onChange={(event) =>
                                        setNutritionValues((values) => ({
                                            ...values,
                                            [field.name]: event.target.value,
                                        }))
                                    }
                                />
                                {field.unit}
                            </span>
                        </label>
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
