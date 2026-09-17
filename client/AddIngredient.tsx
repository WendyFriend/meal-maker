import { useState } from 'react';
import './AddIngredient.css';
import type { IngredientInfo } from '../shared/types/types';
import checkmarkAnimation from './assets/animations/checkmark.svg';
import { NutritionField, type NutritionFieldConfig, type NutritionFieldId } from './meal-generator/components/NutritionField';

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

type AddIngredientProps = {
    onBack: () => void;
    onSave: (ingredient: IngredientInfo) => Promise<void>;
};

function AddIngredient({ onBack, onSave }: AddIngredientProps) {
    const [isSaved, setIsSaved] = useState(false);

    const [ingredientName, setIngredientName] = useState('');

    const [nutritionValues, setNutritionValues] = useState<NutritionValues>({
        caloriesPer100g: '',
        proteinPer100g: '',
        carbohydratePer100g: '',
        fatPer100g: '',
        saturatedFatPer100g: '',
        fiberPer100g: '',
    });

    function handleNutritionChange(field: NutritionFieldId, value: string) {
        setNutritionValues((current) => ({
            ...current,
            [field]: value,
        }));
    }

    function getIngredient(): IngredientInfo {
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
            name: ingredientName.trim(),
            ...nutrition,
        };
    }

    async function handleDone(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        // validation/save logic...

        await onSave(getIngredient());

        setIsSaved(true);

        window.setTimeout(() => {
            onBack();
        }, 920);
    }

    return (
        <main className="add-ingredient">
            <form onSubmit={handleDone}>
                <label className="add-ingredient-name">
                    <span>Name</span>

                    <div className="name-field-input">
                        <input
                            type="text"
                            value={ingredientName}
                            onChange={(event) =>
                                setIngredientName(event.target.value)
                            }
                            required
                            autoFocus
                        />
                    </div>
                </label>

                <div className="nutrition-fields">
                    {nutritionFields.map((field) => (
                        <NutritionField
                            key={field.id}
                            fieldId={field.id}
                            fieldLabel={field.label}
                            fieldValue={nutritionValues[field.id]}
                            unit={field.unit}
                            required={field.required}
                            onChange={handleNutritionChange}
                        />
                    ))}
                </div>

                <button
                    type="submit"
                    className="add-ingredient-done"
                    disabled={isSaved}
                >
                    Done
                </button>
            </form>

            {isSaved && (
                <div className="save-success" aria-hidden="true">
                    <img
                        src={checkmarkAnimation}
                        alt=""
                        className="save-success-animation"
                    />
                </div>
            )}
        </main>
    );
}

export default AddIngredient;
