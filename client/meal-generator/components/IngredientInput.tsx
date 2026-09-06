import { useEffect, useState } from 'react';
import './IngredientInput.css';
import type { IngredientInfo as Ingredient } from '../../../shared/types/types';

type IngredientInputProps = {
    ingredients: Ingredient[];
    onChange: (ingredients: Ingredient[]) => void;
};

type NutritionField = Exclude<keyof Ingredient, 'name' | 'saturatedFatPer100g'>;

const nutritionFields: Array<{
    name: NutritionField;
    label: string;
    unit: string;
}> = [
    { name: 'caloriesPer100g', label: 'Calories', unit: 'kcal' },
    { name: 'proteinPer100g', label: 'Protein', unit: 'g' },
    { name: 'carbohydratePer100g', label: 'Carbs', unit: 'g' },
    { name: 'fatPer100g', label: 'Fat', unit: 'g' },
    { name: 'fiberPer100g', label: 'Fiber', unit: 'g' },
];

const savedIngredientsKey = 'meal-maker-saved-ingredients';

function getSavedIngredients(): Ingredient[] {
    try {
        const saved = localStorage.getItem(savedIngredientsKey);
        return saved ? (JSON.parse(saved) as Ingredient[]) : [];
    } catch {
        return [];
    }
}

function IngredientInput({ ingredients, onChange }: IngredientInputProps) {
    const [input, setInput] = useState('');
    const [selectedIngredient, setSelectedIngredient] = useState<Ingredient>();
    const [ingredientName, setIngredientName] = useState('');
    const [isEditingIngredientName, setIsEditingIngredientName] =
        useState(false);
    const [nutritionValues, setNutritionValues] = useState<
        Record<NutritionField, string>
    >({
        caloriesPer100g: '',
        proteinPer100g: '',
        carbohydratePer100g: '',
        fatPer100g: '',
        fiberPer100g: '',
    });
    const [saveToIngredients, setSaveToIngredients] = useState(false);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setSelectedIngredient(undefined);
            }
        }

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, []);

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault(); // prevent form submission

        const ingredient = input.trim();

        // if the input is empty, do not add it to the list
        if (!ingredient) {
            return;
        }

        // if the ingredient is already in the list, do not add it again
        if (ingredients.some((current) => current.name === ingredient)) {
            setInput('');
            return;
        }

        const savedIngredient = getSavedIngredients().find(
            (saved) =>
                saved.name.toLocaleLowerCase() ===
                ingredient.toLocaleLowerCase(),
        );
        onChange([...ingredients, savedIngredient ?? { name: ingredient }]);
        setInput(''); // clear the input field
    }

    function removeIngredient(ingredientToRemove: string) {
        onChange(
            ingredients.filter(
                (ingredient) => ingredient.name !== ingredientToRemove,
            ),
        );
    }

    function openNutritionDialog(ingredient: Ingredient) {
        setSelectedIngredient(ingredient);
        setIngredientName(ingredient.name);
        setIsEditingIngredientName(false);
        setNutritionValues({
            caloriesPer100g: String(ingredient.caloriesPer100g ?? ''),
            proteinPer100g: String(ingredient.proteinPer100g ?? ''),
            carbohydratePer100g: String(ingredient.carbohydratePer100g ?? ''),
            fatPer100g: String(ingredient.fatPer100g ?? ''),
            fiberPer100g: String(ingredient.fiberPer100g ?? ''),
        });
        setSaveToIngredients(
            getSavedIngredients().some(
                (saved) =>
                    saved.name.toLocaleLowerCase() ===
                    ingredient.name.toLocaleLowerCase(),
            ),
        );
    }

    function saveIngredientName() {
        if (!selectedIngredient) return;

        const name = ingredientName.trim() || selectedIngredient.name;
        setIngredientName(name);
        setIsEditingIngredientName(false);

        if (name === selectedIngredient.name) return;

        const updatedIngredient = { ...selectedIngredient, name };
        setSelectedIngredient(updatedIngredient);
        onChange(
            ingredients.map((ingredient) =>
                ingredient.name === selectedIngredient.name
                    ? updatedIngredient
                    : ingredient,
            ),
        );
    }

    function handleDone() {
        if (!selectedIngredient) return;

        const name = ingredientName.trim() || selectedIngredient.name;

        const nutrition = nutritionFields.reduce<Partial<Ingredient>>(
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
        const updatedIngredient = {
            ...selectedIngredient,
            ...nutrition,
            name,
        };

        onChange(
            ingredients.map((ingredient) =>
                ingredient.name === selectedIngredient.name
                    ? updatedIngredient
                    : ingredient,
            ),
        );

        if (saveToIngredients) {
            const savedIngredients = getSavedIngredients().filter(
                (ingredient) =>
                    ingredient.name.toLocaleLowerCase() !==
                    selectedIngredient.name.toLocaleLowerCase(),
            );

            localStorage.setItem(
                savedIngredientsKey,
                JSON.stringify([...savedIngredients, updatedIngredient]),
            );
        }

        setSelectedIngredient(undefined);
    }

    return (
        <div className="ingredient-input">
            <h2>Ingredients</h2>
            <div className="ingredient-chips">
                {ingredients.map((ingredient) => (
                    <span className="ingredient-chip" key={ingredient.name}>
                        <button
                            type="button"
                            className="ingredient-chip-label"
                            onClick={() => openNutritionDialog(ingredient)}
                            aria-label={`Edit nutrition for ${ingredient.name}`}
                        >
                            {ingredient.name}
                        </button>
                        <button
                            type="button"
                            onClick={() => removeIngredient(ingredient.name)}
                            aria-label={`Remove ${ingredient.name}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>

            <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                enterKeyHint="done"
                placeholder="Add an ingredient..."
            />

            {selectedIngredient && (
                <div
                    className="nutrition-dialog-backdrop"
                    onMouseDown={() => {
                        saveIngredientName();
                        setSelectedIngredient(undefined);
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
                                    <span>{field.label} *</span>
                                    <span className="nutrition-field-input">
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            inputMode="decimal"
                                            value={nutritionValues[field.name]}
                                            onChange={(event) =>
                                                setNutritionValues(
                                                    (values) => ({
                                                        ...values,
                                                        [field.name]:
                                                            event.target.value,
                                                    }),
                                                )
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
                                checked={saveToIngredients}
                                onChange={(event) =>
                                    setSaveToIngredients(event.target.checked)
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
            )}

            {/* <p>Type an ingredient and press Enter</p> */}
        </div>
    );
}

export default IngredientInput;
