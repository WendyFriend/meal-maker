import { useState } from 'react';
import { createPortal } from 'react-dom';
import './AddIngredient.css';
import type {
    IngredientInfo,
    NutritionSearchResult,
    PantryDetails,
} from '../shared/types/types';
import { useNutritionSearch } from './hooks/useNutritionSearch';
import { parsePantryInputs, toPantryInputs } from './utils/pantry';
import { PantryFields } from './meal-generator/components/PantryFields';
import checkmarkAnimation from './assets/animations/checkmark.svg';
import {
    NutritionField,
    type NutritionFieldConfig,
    type NutritionFieldId,
} from './meal-generator/components/NutritionField';

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
        label: 'Fat',
        id: 'fatPer100g',
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
        label: 'Sugar',
        id: 'sugarPer100g',
        unit: 'g',
        required: false,
    },
    {
        label: 'Dietary Fiber',
        id: 'fiberPer100g',
        unit: 'g',
        required: false,
    },
];

type AddIngredientProps = {
    onBack: () => void;
    onSave: (ingredient: IngredientInfo & PantryDetails) => Promise<void>;
    findExistingIngredient: (name: string) => string | undefined;
};

function AddIngredient({
    onBack,
    onSave,
    findExistingIngredient,
}: AddIngredientProps) {
    const [isSaved, setIsSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [ingredientName, setIngredientName] = useState('');
    const [nutritionValues, setNutritionValues] = useState<NutritionValues>({
        caloriesPer100g: '',
        proteinPer100g: '',
        carbohydratePer100g: '',
        fatPer100g: '',
        saturatedFatPer100g: '',
        sugarPer100g: '',
        fiberPer100g: '',
    });

    // The name picked from the USDA list; no further lookups until edited.
    const [pickedName, setPickedName] = useState<string | null>(null);
    const [pantryInputs, setPantryInputs] = useState(() => toPantryInputs({}));
    const { results: suggestions, isLoading: isSearching } = useNutritionSearch(
        ingredientName,
        ingredientName !== pickedName,
    );

    function pickSuggestion(result: NutritionSearchResult) {
        const format = (value: number | undefined) =>
            value === undefined ? '' : String(Math.round(value * 100) / 100);

        setIngredientName(result.name);
        setPickedName(result.name);
        setNutritionValues((current) => ({
            ...current,
            caloriesPer100g: format(result.caloriesPer100g),
            proteinPer100g: format(result.proteinPer100g),
            carbohydratePer100g: format(result.carbohydratePer100g),
            fatPer100g: format(result.fatPer100g),
            sugarPer100g: format(result.sugarPer100g),
            saturatedFatPer100g: format(result.saturatedFatPer100g),
            fiberPer100g: format(result.fiberPer100g),
        }));
    }

    function handleNutritionChange(field: NutritionFieldId, value: string) {
        setNutritionValues((current) => ({
            ...current,
            [field]: value,
        }));
    }

    function getIngredient(): IngredientInfo & PantryDetails {
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
            ...parsePantryInputs(pantryInputs),
        };
    }

    async function handleDone(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (findExistingIngredient(ingredientName)) return;

        setIsSaving(true);
        setSaveError(null);

        try {
            await onSave(getIngredient());
            setIsSaved(true);
            window.setTimeout(onBack, 950);
        } catch (error) {
            console.error(error);
            setSaveError('Could not save this ingredient. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    const existingIngredientName = findExistingIngredient(ingredientName);

    return (
        <main className="add-ingredient">
            <form id="add-ingredient-form" onSubmit={handleDone}>
                <div className="add-ingredient-form-card">
                    <label className="add-ingredient-name">
                        <span className="add-ingredient-field-label">
                            Ingredient name
                            <span
                                className="required-marker"
                                aria-hidden="true"
                            >
                                {' '}
                                *
                            </span>
                        </span>
                        <div className="add-ingredient-name-input input-underline">
                            <input
                                type="text"
                                className="line-input"
                                value={ingredientName}
                                onChange={(event) =>
                                    setIngredientName(event.target.value)
                                }
                                placeholder="e.g. Chickpeas"
                                autoComplete="off"
                                required
                                autoFocus
                            />
                        </div>
                        {(suggestions.length > 0 || isSearching) && (
                            <span className="add-ingredient-hint">
                                {isSearching ? (
                                    <span
                                        className="inline-loading"
                                        role="status"
                                    >
                                        Searching USDA…
                                    </span>
                                ) : (
                                    'Pick a match to fill in nutrition'
                                )}
                            </span>
                        )}
                        {existingIngredientName && !isSaved && (
                            <span
                                className="add-ingredient-inline-error"
                                role="alert"
                            >
                                {existingIngredientName} is already in your
                                ingredients.
                            </span>
                        )}
                    </label>

                    {suggestions.length > 0 && (
                        <ul
                            className="add-ingredient-suggestions"
                            aria-label="USDA suggestions"
                        >
                            {suggestions.slice(0, 6).map((result) => (
                                <li
                                    key={`${result.name}-${result.description}`}
                                >
                                    <button
                                        type="button"
                                        className="add-ingredient-suggestion"
                                        onClick={() => pickSuggestion(result)}
                                    >
                                        <span className="add-ingredient-suggestion-name">
                                            {result.description || result.name}
                                        </span>
                                        <span className="add-ingredient-suggestion-kcal">
                                            {Math.round(result.caloriesPer100g)}{' '}
                                            kcal
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="add-ingredient-divider" />

                    <section
                        className="add-ingredient-nutrition"
                        aria-labelledby="nutrition-heading"
                    >
                        <h2 id="nutrition-heading">Nutrition per 100g</h2>
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
                    </section>

                    <div className="add-ingredient-divider" />

                    <section
                        className="add-ingredient-pantry"
                        aria-labelledby="pantry-heading"
                    >
                        <h2 id="pantry-heading">
                            On hand{' '}
                            <span className="add-ingredient-optional">
                                optional
                            </span>
                        </h2>
                        <PantryFields
                            values={pantryInputs}
                            onChange={setPantryInputs}
                        />
                    </section>
                </div>

                {saveError && (
                    <p className="add-ingredient-save-error" role="alert">
                        {saveError}
                    </p>
                )}
            </form>

            {createPortal(
                <button
                    type="submit"
                    form="add-ingredient-form"
                    className="add-ingredient-done"
                    disabled={isSaved || isSaving}
                >
                    {isSaving ? 'Saving…' : 'Done'}
                </button>,
                document.body,
            )}

            {isSaved &&
                createPortal(
                    <div className="save-success" aria-hidden="true">
                        <img
                            src={checkmarkAnimation}
                            alt=""
                            className="save-success-animation"
                        />
                    </div>,
                    document.body,
                )}
        </main>
    );
}

export default AddIngredient;
