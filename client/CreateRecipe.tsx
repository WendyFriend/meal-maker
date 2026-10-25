import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Recipe } from '../shared/types/recipe';
import type {
    IngredientNutrition,
    MealIngredient,
    NutritionSearchResponse,
    NutritionSearchResult,
    UserIngredient,
} from '../shared/types/types';
import { saveRecipe } from './services/recipeService';
import './CreateRecipe.css';

type CreateRecipeProps = {
    savedIngredients: UserIngredient[];
    onSaved: (recipe: Recipe) => void;
    onCancel: () => void;
};

type DraftIngredient = IngredientNutrition & {
    key: number;
    weight: number;
};

type ManualDraft = {
    name: string;
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
};

const WEIGHT_STEP = 10;
const DEFAULT_WEIGHT = 100;
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 12;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_MANUAL: ManualDraft = {
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
};

export default function CreateRecipe({
    savedIngredients,
    onSaved,
    onCancel,
}: CreateRecipeProps) {
    const formId = useId();
    const [recipeName, setRecipeName] = useState('');
    const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
    const [servings, setServings] = useState(MIN_SERVINGS);
    const [steps, setSteps] = useState<string[]>(['']);
    const [query, setQuery] = useState('');
    // Results are tagged with the query they answer, so a stale or pending
    // lookup reads as "searching" without setting state inside the effect.
    const [usda, setUsda] = useState<{
        query: string;
        results: NutritionSearchResult[];
        failed: boolean;
    } | null>(null);
    const [manual, setManual] = useState<ManualDraft | null>(null);
    const [manualError, setManualError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [nextKey, setNextKey] = useState(1);

    const trimmedQuery = query.trim();

    const usdaCurrent = usda?.query === trimmedQuery ? usda : null;
    const usdaResults = usdaCurrent?.results ?? [];

    const savedMatches = useMemo(() => {
        const needle = trimmedQuery.toLowerCase();

        return savedIngredients
            .filter((item) => item.name.toLowerCase().includes(needle))
            .slice(0, needle ? 8 : 6);
    }, [savedIngredients, trimmedQuery]);

    // Debounced USDA lookup; any failure just leaves manual entry available.
    useEffect(() => {
        if (trimmedQuery.length < 2) {
            return;
        }

        const controller = new AbortController();

        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch(
                    `/api/nutrition?q=${encodeURIComponent(trimmedQuery)}`,
                    { signal: controller.signal },
                );

                if (!response.ok) {
                    throw new Error('Nutrition lookup failed');
                }

                const data = (await response.json()) as NutritionSearchResponse;
                setUsda({
                    query: trimmedQuery,
                    results: (data.results ?? []).slice(0, 6),
                    failed: false,
                });
            } catch {
                if (!controller.signal.aborted) {
                    setUsda({ query: trimmedQuery, results: [], failed: true });
                }
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [trimmedQuery]);

    const totals = useMemo(() => {
        const sum = { calories: 0, protein: 0, carbs: 0, fat: 0 };

        for (const item of ingredients) {
            const factor = item.weight / 100;
            sum.calories += item.caloriesPer100g * factor;
            sum.protein += item.proteinPer100g * factor;
            sum.carbs += item.carbohydratePer100g * factor;
            sum.fat += item.fatPer100g * factor;
        }

        return sum;
    }, [ingredients]);

    const nameError = recipeName.trim() ? '' : 'Give your recipe a name.';
    const ingredientError = !ingredients.length
        ? 'Add at least one ingredient.'
        : ingredients.some((item) => !(item.weight > 0))
          ? 'Every ingredient needs a weight above 0 g.'
          : '';
    const isDirty =
        recipeName.trim() !== '' ||
        ingredients.length > 0 ||
        steps.some((step) => step.trim() !== '');

    function addIngredient(nutrition: IngredientNutrition) {
        setIngredients((current) => [
            ...current,
            {
                name: nutrition.name,
                caloriesPer100g: nutrition.caloriesPer100g,
                proteinPer100g: nutrition.proteinPer100g,
                carbohydratePer100g: nutrition.carbohydratePer100g,
                fatPer100g: nutrition.fatPer100g,
                sugarPer100g: nutrition.sugarPer100g,
                saturatedFatPer100g: nutrition.saturatedFatPer100g,
                fiberPer100g: nutrition.fiberPer100g,
                key: nextKey,
                weight: DEFAULT_WEIGHT,
            },
        ]);
        setNextKey((key) => key + 1);
        setQuery('');
        setManual(null);
        setManualError('');
    }

    function setWeight(key: number, weight: number) {
        setIngredients((current) =>
            current.map((item) =>
                item.key === key
                    ? { ...item, weight: Math.max(0, weight) }
                    : item,
            ),
        );
    }

    function addManual() {
        if (!manual) {
            return;
        }

        const values = [
            manual.calories,
            manual.protein,
            manual.carbs,
            manual.fat,
        ].map((value) => (value.trim() === '' ? 0 : Number(value)));

        if (!manual.name.trim()) {
            setManualError('Enter a name for the ingredient.');
            return;
        }

        if (values.some((value) => !Number.isFinite(value) || value < 0)) {
            setManualError('Nutrition values must be 0 or more.');
            return;
        }

        addIngredient({
            name: manual.name.trim(),
            caloriesPer100g: values[0],
            proteinPer100g: values[1],
            carbohydratePer100g: values[2],
            fatPer100g: values[3],
        });
    }

    function moveStep(index: number, direction: -1 | 1) {
        setSteps((current) => {
            const target = index + direction;

            if (target < 0 || target >= current.length) {
                return current;
            }

            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    }

    function removeStep(index: number) {
        setSteps((current) =>
            current.length === 1 ? [''] : current.filter((_, i) => i !== index),
        );
    }

    function handleCancel() {
        if (
            isDirty &&
            !window.confirm('Discard this recipe? Your changes will be lost.')
        ) {
            return;
        }

        onCancel();
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitted(true);
        setSaveError('');

        if (nameError || ingredientError || saving) {
            return;
        }

        setSaving(true);

        try {
            const mealIngredients: MealIngredient[] = ingredients.map(
                (item) => {
                    const { key, ...rest } = item;
                    void key;
                    return rest;
                },
            );
            const saved = await saveRecipe({
                recipeName: recipeName.trim(),
                ingredients: mealIngredients,
                instructions: steps.map((step) => step.trim()).filter(Boolean),
                servings,
            });

            onSaved(saved);
        } catch (error) {
            setSaveError(
                error instanceof Error && error.message
                    ? `Couldn't save your recipe: ${error.message}`
                    : "Couldn't save your recipe. Please try again.",
            );
            setSaving(false);
        }
    }

    return (
        <form
            className="create-recipe app-card"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Create recipe"
        >
            <header className="create-recipe-header">
                <h2>Create a recipe</h2>
                <p>Build it yourself, ingredient by ingredient.</p>
            </header>

            <section className="create-recipe-section">
                <StepHeader
                    number={1}
                    title="Name your recipe"
                    hint="Required"
                />
                <label
                    className="create-recipe-label"
                    htmlFor={`${formId}-name`}
                >
                    Recipe name
                </label>
                <input
                    id={`${formId}-name`}
                    className="meal-form-field create-recipe-input"
                    value={recipeName}
                    onChange={(event) => setRecipeName(event.target.value)}
                    placeholder="e.g. Chicken and rice bowl"
                    maxLength={120}
                    aria-invalid={submitted && !!nameError}
                    aria-describedby={
                        submitted && nameError
                            ? `${formId}-name-error`
                            : undefined
                    }
                />
                {submitted && nameError && (
                    <p
                        className="create-recipe-error"
                        id={`${formId}-name-error`}
                        role="alert"
                    >
                        {nameError}
                    </p>
                )}
            </section>

            <section className="create-recipe-section">
                <StepHeader
                    number={2}
                    title="Add ingredients"
                    hint="Amounts are per serving"
                />

                {ingredients.length > 0 && (
                    <ul
                        className="create-recipe-ingredients"
                        aria-label="Recipe ingredients"
                    >
                        {ingredients.map((item) => (
                            <li key={item.key} className="create-recipe-row">
                                <div className="create-recipe-row-info">
                                    <span className="create-recipe-row-name">
                                        {item.name}
                                    </span>
                                    <span className="create-recipe-row-meta">
                                        {Math.round(
                                            (item.caloriesPer100g *
                                                item.weight) /
                                                100,
                                        )}{' '}
                                        kcal
                                    </span>
                                </div>
                                <div className="ingredient-weight-control">
                                    <button
                                        type="button"
                                        aria-label={`Decrease ${item.name} weight`}
                                        onClick={() =>
                                            setWeight(
                                                item.key,
                                                item.weight - WEIGHT_STEP,
                                            )
                                        }
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        aria-label={`${item.name} weight in grams`}
                                        value={item.weight || ''}
                                        placeholder="0"
                                        onChange={(event) =>
                                            setWeight(
                                                item.key,
                                                Number(event.target.value),
                                            )
                                        }
                                    />
                                    <span aria-hidden="true">g</span>
                                    <button
                                        type="button"
                                        aria-label={`Increase ${item.name} weight`}
                                        onClick={() =>
                                            setWeight(
                                                item.key,
                                                item.weight + WEIGHT_STEP,
                                            )
                                        }
                                    >
                                        +
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className="create-recipe-icon-button"
                                    aria-label={`Remove ${item.name}`}
                                    onClick={() =>
                                        setIngredients((current) =>
                                            current.filter(
                                                (other) =>
                                                    other.key !== item.key,
                                            ),
                                        )
                                    }
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {submitted && ingredientError && (
                    <p className="create-recipe-error" role="alert">
                        {ingredientError}
                    </p>
                )}

                <div className="create-recipe-picker">
                    <label
                        className="create-recipe-label"
                        htmlFor={`${formId}-search`}
                    >
                        Search ingredients
                    </label>
                    <input
                        id={`${formId}-search`}
                        type="search"
                        className="meal-form-field create-recipe-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search your ingredients or type a new one"
                        autoComplete="off"
                    />

                    {savedMatches.length > 0 && (
                        <>
                            <h4 className="create-recipe-group">
                                Your ingredients
                            </h4>
                            <ul className="create-recipe-options">
                                {savedMatches.map((item) => (
                                    <li key={item.ingredientId}>
                                        <button
                                            type="button"
                                            className="create-recipe-option"
                                            onClick={() => addIngredient(item)}
                                        >
                                            <span>{item.name}</span>
                                            <small>
                                                {Math.round(
                                                    item.caloriesPer100g,
                                                )}{' '}
                                                kcal / 100 g
                                            </small>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {trimmedQuery.length >= 2 && (
                        <>
                            <h4 className="create-recipe-group">
                                USDA results
                            </h4>
                            {!usdaCurrent && (
                                <p className="create-recipe-hint">
                                    <span
                                        className="inline-loading"
                                        role="status"
                                    >
                                        Searching USDA…
                                    </span>
                                </p>
                            )}
                            {usdaCurrent?.failed && (
                                <p className="create-recipe-hint">
                                    Nutrition search isn&apos;t available right
                                    now. You can enter the values yourself.
                                </p>
                            )}
                            {usdaCurrent &&
                                !usdaCurrent.failed &&
                                usdaResults.length === 0 && (
                                    <p className="create-recipe-hint">
                                        No matches found.
                                    </p>
                                )}
                            {usdaResults.length > 0 && (
                                <ul className="create-recipe-options">
                                    {usdaResults.map((result) => (
                                        <li
                                            key={`${result.name}-${result.description}`}
                                        >
                                            <button
                                                type="button"
                                                className="create-recipe-option"
                                                onClick={() =>
                                                    addIngredient(result)
                                                }
                                            >
                                                <span>
                                                    {result.description}
                                                </span>
                                                <small>
                                                    {Math.round(
                                                        result.caloriesPer100g,
                                                    )}{' '}
                                                    kcal / 100 g
                                                </small>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}

                    {!manual && (
                        <button
                            type="button"
                            className="create-recipe-link-button"
                            onClick={() =>
                                setManual({
                                    ...EMPTY_MANUAL,
                                    name: trimmedQuery,
                                })
                            }
                        >
                            Enter nutrition manually
                        </button>
                    )}

                    {manual && (
                        <fieldset className="create-recipe-manual">
                            <legend>New ingredient (per 100 g)</legend>
                            <div className="create-recipe-manual-grid">
                                <ManualField
                                    id={`${formId}-m-name`}
                                    label="Ingredient name"
                                    wide
                                    value={manual.name}
                                    onChange={(name) =>
                                        setManual({ ...manual, name })
                                    }
                                />
                                <ManualField
                                    id={`${formId}-m-kcal`}
                                    label="Calories (kcal per 100 g)"
                                    numeric
                                    value={manual.calories}
                                    onChange={(calories) =>
                                        setManual({ ...manual, calories })
                                    }
                                />
                                <ManualField
                                    id={`${formId}-m-protein`}
                                    label="Protein (g per 100 g)"
                                    numeric
                                    value={manual.protein}
                                    onChange={(protein) =>
                                        setManual({ ...manual, protein })
                                    }
                                />
                                <ManualField
                                    id={`${formId}-m-carbs`}
                                    label="Carbs (g per 100 g)"
                                    numeric
                                    value={manual.carbs}
                                    onChange={(carbs) =>
                                        setManual({ ...manual, carbs })
                                    }
                                />
                                <ManualField
                                    id={`${formId}-m-fat`}
                                    label="Fat (g per 100 g)"
                                    numeric
                                    value={manual.fat}
                                    onChange={(fat) =>
                                        setManual({ ...manual, fat })
                                    }
                                />
                            </div>
                            {manualError && (
                                <p className="create-recipe-error" role="alert">
                                    {manualError}
                                </p>
                            )}
                            <div className="create-recipe-manual-actions">
                                <button
                                    type="button"
                                    className="create-recipe-secondary"
                                    onClick={() => {
                                        setManual(null);
                                        setManualError('');
                                    }}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    className="create-recipe-primary"
                                    onClick={addManual}
                                >
                                    Add ingredient
                                </button>
                            </div>
                        </fieldset>
                    )}
                </div>
            </section>

            <section className="create-recipe-section">
                <StepHeader
                    number={3}
                    title="Servings and nutrition"
                    hint="Ingredient amounts are per serving"
                />
                <div className="create-recipe-servings">
                    <span id={`${formId}-servings`}>Servings</span>
                    <div
                        className="ingredient-weight-control"
                        role="group"
                        aria-labelledby={`${formId}-servings`}
                    >
                        <button
                            type="button"
                            aria-label="Decrease servings"
                            disabled={servings <= MIN_SERVINGS}
                            onClick={() => setServings((value) => value - 1)}
                        >
                            −
                        </button>
                        <output aria-live="polite" aria-label="Servings">
                            {servings}
                        </output>
                        <button
                            type="button"
                            aria-label="Increase servings"
                            disabled={servings >= MAX_SERVINGS}
                            onClick={() => setServings((value) => value + 1)}
                        >
                            +
                        </button>
                    </div>
                </div>
                <div
                    className="nutrition-summary create-recipe-totals"
                    role="group"
                    aria-label="Nutrition per serving"
                >
                    <Tile
                        label="Calories"
                        value={totals.calories}
                        unit="kcal"
                    />
                    <Tile label="Protein" value={totals.protein} unit="g" />
                    <Tile label="Carbs" value={totals.carbs} unit="g" />
                    <Tile label="Fat" value={totals.fat} unit="g" />
                </div>
                <p className="create-recipe-hint">Per serving</p>
            </section>

            <section className="create-recipe-section">
                <StepHeader
                    number={4}
                    title="Instructions"
                    hint="Optional, in order"
                />
                <ol className="create-recipe-steps">
                    {steps.map((step, index) => (
                        <li key={index} className="create-recipe-step">
                            <span className="create-recipe-step-number">
                                {index + 1}
                            </span>
                            <textarea
                                className="meal-form-field create-recipe-input"
                                rows={2}
                                aria-label={`Step ${index + 1}`}
                                value={step}
                                placeholder="Describe this step"
                                onChange={(event) =>
                                    setSteps((current) =>
                                        current.map((value, i) =>
                                            i === index
                                                ? event.target.value
                                                : value,
                                        ),
                                    )
                                }
                            />
                            <div className="create-recipe-step-actions">
                                <button
                                    type="button"
                                    className="create-recipe-icon-button"
                                    aria-label={`Move step ${index + 1} up`}
                                    disabled={index === 0}
                                    onClick={() => moveStep(index, -1)}
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className="create-recipe-icon-button"
                                    aria-label={`Move step ${index + 1} down`}
                                    disabled={index === steps.length - 1}
                                    onClick={() => moveStep(index, 1)}
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    className="create-recipe-icon-button"
                                    aria-label={`Remove step ${index + 1}`}
                                    onClick={() => removeStep(index)}
                                >
                                    ×
                                </button>
                            </div>
                        </li>
                    ))}
                </ol>
                <button
                    type="button"
                    className="create-recipe-link-button"
                    onClick={() => setSteps((current) => [...current, ''])}
                >
                    + Add step
                </button>
            </section>

            {saveError && (
                <p className="create-recipe-error" role="alert">
                    {saveError}
                </p>
            )}

            <div className="create-recipe-footer">
                <button
                    type="button"
                    className="create-recipe-secondary"
                    onClick={handleCancel}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="create-recipe-primary"
                    disabled={saving}
                >
                    {saving ? 'Saving…' : 'Save recipe'}
                </button>
            </div>
        </form>
    );
}

function StepHeader({
    number,
    title,
    hint,
}: {
    number: number;
    title: string;
    hint: string;
}) {
    return (
        <div className="meal-step-header">
            <span className="meal-step-number" aria-hidden="true">
                {number}
            </span>
            <div className="meal-step-copy">
                <h3>{title}</h3>
                <p>{hint}</p>
            </div>
        </div>
    );
}

function Tile({
    label,
    value,
    unit,
}: {
    label: string;
    value: number;
    unit: string;
}) {
    return (
        <div className="nutrition-summary-item">
            <span className="nutrition-summary-label">{label}</span>
            <span className="nutrition-summary-value">{Math.round(value)}</span>
            <span className="nutrition-summary-unit">{unit}</span>
        </div>
    );
}

function ManualField({
    id,
    label,
    value,
    onChange,
    numeric,
    wide,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    numeric?: boolean;
    wide?: boolean;
}) {
    return (
        <div
            className={
                wide
                    ? 'create-recipe-manual-field create-recipe-manual-wide'
                    : 'create-recipe-manual-field'
            }
        >
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                className="meal-form-field create-recipe-input"
                type={numeric ? 'number' : 'text'}
                inputMode={numeric ? 'decimal' : undefined}
                min={numeric ? 0 : undefined}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}
