import { useState } from 'react';
import './AddIngredient.css';
import type { NutritionFieldId } from './meal-generator/components/NutritionFields';
import NutritionFields from './meal-generator/components/NutritionFields';
import type { IngredientInfo } from '../shared/types/types';
import checkmarkAnimation from './assets/animations/checkmark.svg';

type AddIngredientProps = {
    onBack: () => void;
    onSave: (ingredient: IngredientInfo) => Promise<void>;
};

function AddIngredient({ onBack, onSave }: AddIngredientProps) {
    const [isSaved, setIsSaved] = useState(false);
    const [ingredient, setIngredient] = useState<IngredientInfo>({
        name: '',
        caloriesPer100g: undefined,
        proteinPer100g: undefined,
        carbohydratePer100g: undefined,
        fatPer100g: undefined,
        saturatedFatPer100g: undefined,
        fiberPer100g: undefined,
    });

    const handleNutritionChange = (
        field: NutritionFieldId,
        value: number | undefined,
    ) => {
        setIngredient((current) => ({
            ...current,
            [field]: value,
        }));
    };

    async function handleDone(event: React.ChangeEvent) {
        event.preventDefault();

        // validation/save logic...

        await onSave(ingredient);

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
                            value={ingredient.name}
                            onChange={(e) =>
                                setIngredient((current) => ({
                                    ...current,
                                    name: e.target.value,
                                }))
                            }
                            required
                            autoFocus
                        />
                    </div>
                </label>

                <NutritionFields
                    ingredient={ingredient}
                    onChange={handleNutritionChange}
                />

                <button
                    type="submit"
                    className={'add-ingredient-done'}
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
