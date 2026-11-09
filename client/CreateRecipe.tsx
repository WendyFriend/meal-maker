import {
    useContext,
    useId,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from 'react';
import type {
    IngredientInfo,
    MealIngredient,
    UserIngredient,
} from '../shared/types/types';
import { MICRONUTRIENTS } from '../shared/micronutrients';
import type { RecipeInput } from './services/recipeService';
import { getIngredientNutrition } from './services/micronutrientService';
import {
    commonQuickAddIngredients,
    findCommonQuickAddIngredient,
} from './meal-generator/components/commonQuickAddIngredients';
import { normalizeIngredientName } from './utils/Ingredient';
import { totalNutrition } from './utils/nutrition';
import NutritionOverview from './meal-generator/components/NutritionOverview';
import MealMicronutrients from './meal-generator/components/MealMicronutrients';
import MealInstructions from './meal-generator/components/MealInstructions';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import { IngredientCollectionContext } from './ingredients/IngredientCollectionContext';
import './CreateRecipe.css';

type NutritionKey =
    | 'caloriesPer100g'
    | 'proteinPer100g'
    | 'carbohydratePer100g'
    | 'fatPer100g'
    | 'fiberPer100g';
type NutritionDraft = Record<NutritionKey, string>;
type IngredientRow = {
    id: number;
    name: string;
    weight: string;
    nutrition: NutritionDraft;
    source?: IngredientInfo;
    committed?: boolean;
    lookingUp?: boolean;
    lookupFailed?: boolean;
};

const nutritionFields: NutritionKey[] = [
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
    'fiberPer100g',
];

function emptyNutrition(): NutritionDraft {
    return {
        caloriesPer100g: '',
        proteinPer100g: '',
        carbohydratePer100g: '',
        fatPer100g: '',
        fiberPer100g: '',
    };
}

function nutritionFrom(source: IngredientInfo): NutritionDraft {
    return Object.fromEntries(
        nutritionFields.map((key) => [
            key,
            typeof source[key] === 'number' && Number.isFinite(source[key])
                ? String(source[key])
                : '',
        ]),
    ) as NutritionDraft;
}

function validAmount(value: string) {
    return (
        value.trim() !== '' &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0
    );
}

function toIngredient(row: IngredientRow): MealIngredient | undefined {
    if (
        !row.name.trim() ||
        !validAmount(row.weight) ||
        Number(row.weight) <= 0 ||
        nutritionFields
            .slice(0, 4)
            .some((key) => !validAmount(row.nutrition[key])) ||
        (row.nutrition.fiberPer100g.trim() &&
            !validAmount(row.nutrition.fiberPer100g))
    )
        return undefined;

    const source = row.source;
    return {
        ...(source && 'weight' in source ? source : {}),
        name: row.name.trim(),
        weight: Number(row.weight),
        caloriesPer100g: Number(row.nutrition.caloriesPer100g),
        proteinPer100g: Number(row.nutrition.proteinPer100g),
        carbohydratePer100g: Number(row.nutrition.carbohydratePer100g),
        fatPer100g: Number(row.nutrition.fatPer100g),
        ...(row.nutrition.fiberPer100g.trim() && {
            fiberPer100g: Number(row.nutrition.fiberPer100g),
        }),
        ...(source?.nutritionSource && {
            nutritionSource: source.nutritionSource,
        }),
        ...Object.fromEntries(
            MICRONUTRIENTS.flatMap(({ key }) =>
                source?.[key] === undefined ? [] : [[key, source[key]]],
            ),
        ),
    };
}

function RecipeImagePlaceholder() {
    return (
        <div
            className="create-recipe-photo"
            role="img"
            aria-label="Default recipe image"
        >
            <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
                <path d="M18 43h60c0 22-13 37-30 37S18 65 18 43Z" />
                <path d="M13 43h70M25 78h46M28 42c-9-11 0-22 12-19 3-11 17-12 22-1 10-5 20 4 16 14" />
                <path d="M60 35c1-13 9-19 24-22-1 13-8 21-21 25M60 35l20-18M56 68c8-2 13-6 16-13" />
            </svg>
        </div>
    );
}

const commonSuggestions = Object.values(commonQuickAddIngredients).flat();

function RecipeIngredientNameInput({
    value,
    index,
    committed,
    focusInput,
    savedIngredients,
    lookingUp,
    lookupFailed,
    onChange,
    onCommit,
    onOpenSheet,
}: {
    value: string;
    index: number;
    committed?: boolean;
    focusInput: (node: HTMLInputElement | null) => void;
    savedIngredients: UserIngredient[];
    lookingUp?: boolean;
    lookupFailed?: boolean;
    onChange: (value: string) => void;
    onCommit: (value: string) => void;
    onOpenSheet: () => void;
}) {
    const listboxId = useId();
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const query = normalizeIngredientName(value);
    const seen = new Set<string>();
    const suggestions = [...savedIngredients, ...commonSuggestions]
        .filter((item) => {
            const key = normalizeIngredientName(item.name);
            if (!query || !key.includes(query) || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);
    const exactMatch = suggestions.some(
        (item) => normalizeIngredientName(item.name) === query,
    );
    const options = [
        ...suggestions.map((item) => ({
            name: item.name,
            label: item.name,
        })),
        ...(!exactMatch && query
            ? [
                  {
                      name: value.trim(),
                      label: `+ ${value.trim()}`,
                  },
              ]
            : []),
    ];
    const visible = open && query.length > 0 && options.length > 0;
    const activeIndex =
        highlightedIndex < options.length ? highlightedIndex : -1;

    function choose(name: string) {
        onCommit(name);
        setOpen(false);
        setHighlightedIndex(-1);
    }

    if (committed) {
        return (
            <div className="create-recipe-row-main">
                <button
                    type="button"
                    className="create-recipe-row-name"
                    onClick={onOpenSheet}
                    aria-label={`View ${value} nutrition${lookupFailed ? ', nutrition unavailable' : ''}`}
                >
                    <span>{value}</span>
                    <span
                        className="create-recipe-row-chevron"
                        aria-hidden="true"
                    />
                </button>
                {lookingUp && <small role="status">Finding nutrition…</small>}
            </div>
        );
    }

    return (
        <div className="create-recipe-row-main">
            <input
                ref={focusInput}
                type="text"
                role="combobox"
                aria-label={`Ingredient ${index + 1}`}
                aria-autocomplete="list"
                aria-expanded={visible}
                aria-controls={visible ? listboxId : undefined}
                aria-activedescendant={
                    visible && activeIndex >= 0
                        ? `${listboxId}-${activeIndex}`
                        : undefined
                }
                placeholder="Ingredient name"
                enterKeyHint="done"
                value={value}
                onChange={(event) => {
                    onChange(event.target.value);
                    setOpen(true);
                    setHighlightedIndex(-1);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    setOpen(false);
                    if (value.trim()) onCommit(value);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        setOpen(false);
                        setHighlightedIndex(-1);
                    } else if (visible && event.key === 'ArrowDown') {
                        event.preventDefault();
                        setHighlightedIndex(
                            Math.min(activeIndex + 1, options.length - 1),
                        );
                    } else if (visible && event.key === 'ArrowUp') {
                        event.preventDefault();
                        setHighlightedIndex(Math.max(activeIndex - 1, -1));
                    } else if (event.key === 'Enter') {
                        event.preventDefault();
                        choose(
                            visible && activeIndex >= 0
                                ? options[activeIndex].name
                                : value.trim(),
                        );
                    }
                }}
            />
            {lookingUp && <small role="status">Finding nutrition…</small>}
            {visible && (
                <div
                    className="ingredient-suggestions create-recipe-suggestions"
                    id={listboxId}
                    role="listbox"
                >
                    {options.map((option, optionIndex) => (
                        <button
                            key={option.name}
                            id={`${listboxId}-${optionIndex}`}
                            type="button"
                            role="option"
                            aria-label={option.name}
                            aria-selected={activeIndex === optionIndex}
                            className="ingredient-suggestion create-recipe-suggestion"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => choose(option.name)}
                        >
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function CreateRecipe({
    savedIngredients,
    onSave,
    initialRecipe,
    formId = 'create-recipe-form',
    onCancel,
}: {
    savedIngredients: UserIngredient[];
    onSave: (recipe: RecipeInput) => Promise<void>;
    initialRecipe?: RecipeInput;
    formId?: string;
    onCancel?: () => void;
}) {
    const [name, setName] = useState(initialRecipe?.recipeName ?? '');
    const [rows, setRows] = useState<IngredientRow[]>(() =>
        (initialRecipe?.ingredients ?? []).map((ingredient, id) => ({
            id,
            name: ingredient.name,
            weight: String(ingredient.weight),
            nutrition: nutritionFrom(ingredient),
            source: ingredient,
            committed: true,
        })),
    );
    const [steps, setSteps] = useState<string[]>(
        initialRecipe?.instructions ?? [],
    );
    const [activeTab, setActiveTab] = useState<'nutrition' | 'steps'>(
        'nutrition',
    );
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);
    const [sheetRowId, setSheetRowId] = useState<number | null>(null);
    const ingredientCollection = useContext(IngredientCollectionContext);
    const nextId = useRef(initialRecipe?.ingredients.length ?? 0);
    const focusRow = useRef<number | null>(null);
    const nutritionTab = useRef<HTMLButtonElement>(null);
    const stepsTab = useRef<HTMLButtonElement>(null);
    const sheetRow = rows.find((row) => row.id === sheetRowId);
    const tabIdPrefix =
        formId === 'create-recipe-form' ? 'create-recipe' : formId;
    const ingredients = useMemo(
        () =>
            rows.flatMap((row) => {
                const ingredient = toIngredient(row);
                return ingredient ? [ingredient] : [];
            }),
        [rows],
    );
    const nutrition = useMemo(() => totalNutrition(ingredients), [ingredients]);
    const macroCalories = {
        carbohydrate: nutrition.carbohydrate * 4,
        protein: nutrition.protein * 4,
        fat: nutrition.fat * 9,
    };
    const macroTotal = Object.values(macroCalories).reduce(
        (sum, value) => sum + value,
        0,
    );
    const percentages = {
        carbohydrate: macroTotal
            ? (macroCalories.carbohydrate / macroTotal) * 100
            : 0,
        protein: macroTotal ? (macroCalories.protein / macroTotal) * 100 : 0,
        fat: macroTotal ? (macroCalories.fat / macroTotal) * 100 : 0,
    };

    function updateRow(
        id: number,
        update: (row: IngredientRow) => IngredientRow,
    ) {
        setRows((current) =>
            current.map((row) => (row.id === id ? update(row) : row)),
        );
        setError(undefined);
    }

    function selectName(id: number, value: string) {
        const match =
            savedIngredients.find(
                (item) =>
                    normalizeIngredientName(item.name) ===
                    normalizeIngredientName(value),
            ) ?? findCommonQuickAddIngredient(value);
        updateRow(id, (row) => ({
            ...row,
            name: value,
            source: match,
            nutrition: match ? nutritionFrom(match) : emptyNutrition(),
            committed: false,
            lookingUp: false,
            lookupFailed: false,
        }));
    }

    function commitName(id: number, value: string) {
        const name = value.trim();
        if (!name) return;
        const match =
            savedIngredients.find(
                (item) =>
                    normalizeIngredientName(item.name) ===
                    normalizeIngredientName(name),
            ) ?? findCommonQuickAddIngredient(name);
        updateRow(id, (row) => ({
            ...row,
            name: match?.name ?? name,
            source: match,
            nutrition: match ? nutritionFrom(match) : row.nutrition,
            committed: true,
            lookingUp: !match,
            lookupFailed: false,
        }));
        if (!match) void resolveNutrition(id, name);
    }

    async function resolveNutrition(id: number, requestedName: string) {
        try {
            const source = await getIngredientNutrition(requestedName);
            const lookedUp = nutritionFrom(source);
            setRows((current) =>
                current.map((item) =>
                    item.id === id && item.name.trim() === requestedName
                        ? {
                              ...item,
                              source,
                              nutrition: Object.fromEntries(
                                  nutritionFields.map((key) => [
                                      key,
                                      item.nutrition[key] || lookedUp[key],
                                  ]),
                              ) as NutritionDraft,
                              lookingUp: false,
                          }
                        : item,
                ),
            );
        } catch {
            setRows((current) =>
                current.map((item) =>
                    item.id === id && item.name.trim() === requestedName
                        ? { ...item, lookingUp: false, lookupFailed: true }
                        : item,
                ),
            );
        }
    }

    function addRow() {
        const id = nextId.current++;
        focusRow.current = id;
        setRows((current) => [
            ...current,
            { id, name: '', weight: '100', nutrition: emptyNutrition() },
        ]);
        setError(undefined);
    }

    function applySheetNutrition(id: number, ingredient: IngredientInfo) {
        updateRow(id, (row) => ({
            ...row,
            name: ingredient.name,
            nutrition: nutritionFrom(ingredient),
            source: ingredient,
            committed: true,
            lookingUp: false,
            lookupFailed: false,
        }));
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;
        if (!name.trim()) {
            setError('Enter a recipe name.');
            return;
        }
        if (!rows.length || ingredients.length !== rows.length) {
            setActiveTab('nutrition');
            setError(
                'Add an ingredient name and weight, then tap its name to complete any missing nutrition.',
            );
            return;
        }
        const instructions = steps.map((step) => step.trim()).filter(Boolean);
        setSaving(true);
        setError(undefined);
        try {
            await onSave({
                recipeName: name.trim(),
                ingredients,
                instructions,
            });
        } catch {
            setError('Could not save your recipe. Please try again.');
            setSaving(false);
        }
    }

    return (
        <form
            id={formId}
            className="create-recipe"
            onSubmit={save}
            onReset={(event) => {
                event.preventDefault();
                if (!saving) onCancel?.();
            }}
            aria-busy={saving}
        >
            <fieldset disabled={saving} className="create-recipe-fields">
                <div className="create-recipe-hero">
                    <RecipeImagePlaceholder />
                    <label className="create-recipe-name">
                        <span>Recipe name</span>
                        <input
                            type="text"
                            aria-label="Recipe name"
                            placeholder="e.g. My Chickpea Curry"
                            value={name}
                            onChange={(event) => {
                                setName(event.target.value);
                                setError(undefined);
                            }}
                        />
                    </label>
                </div>

                <div
                    className="create-recipe-tabs"
                    role="tablist"
                    aria-label="Recipe sections"
                    onKeyDown={(event) => {
                        const next =
                            event.key === 'ArrowRight'
                                ? 'steps'
                                : event.key === 'ArrowLeft'
                                  ? 'nutrition'
                                  : null;
                        if (!next) return;
                        event.preventDefault();
                        setActiveTab(next);
                        (next === 'nutrition'
                            ? nutritionTab
                            : stepsTab
                        ).current?.focus();
                    }}
                >
                    <button
                        ref={nutritionTab}
                        type="button"
                        role="tab"
                        id={`${tabIdPrefix}-nutrition-tab`}
                        aria-controls={`${tabIdPrefix}-nutrition-panel`}
                        aria-selected={activeTab === 'nutrition'}
                        tabIndex={activeTab === 'nutrition' ? 0 : -1}
                        onClick={() => setActiveTab('nutrition')}
                    >
                        Ingredients &amp; nutrition
                    </button>
                    <button
                        ref={stepsTab}
                        type="button"
                        role="tab"
                        id={`${tabIdPrefix}-steps-tab`}
                        aria-controls={`${tabIdPrefix}-steps-panel`}
                        aria-selected={activeTab === 'steps'}
                        tabIndex={activeTab === 'steps' ? 0 : -1}
                        onClick={() => setActiveTab('steps')}
                    >
                        Steps{' '}
                        <span className="create-recipe-tab-optional">
                            (optional)
                        </span>
                    </button>
                </div>

                {error && (
                    <p className="create-recipe-error" role="alert">
                        {error}
                    </p>
                )}

                <div
                    id={`${tabIdPrefix}-nutrition-panel`}
                    role="tabpanel"
                    aria-labelledby={`${tabIdPrefix}-nutrition-tab`}
                    hidden={activeTab !== 'nutrition'}
                >
                    <section
                        className="create-recipe-ingredients"
                        aria-labelledby="create-recipe-ingredients-heading"
                    >
                        <h2 id="create-recipe-ingredients-heading">
                            Ingredients
                        </h2>
                        <div className="create-recipe-rows">
                            {rows.map((row, index) => (
                                <div className="create-recipe-row" key={row.id}>
                                    <IngredientThumbnail
                                        name={row.name || 'Ingredient'}
                                        fdcId={
                                            row.source?.nutritionSource?.fdcId
                                        }
                                    />
                                    <RecipeIngredientNameInput
                                        index={index}
                                        value={row.name}
                                        committed={row.committed}
                                        savedIngredients={savedIngredients}
                                        lookingUp={row.lookingUp}
                                        lookupFailed={row.lookupFailed}
                                        focusInput={(node) => {
                                            if (
                                                node &&
                                                focusRow.current === row.id
                                            ) {
                                                focusRow.current = null;
                                                node.focus({
                                                    preventScroll: true,
                                                });
                                            }
                                        }}
                                        onChange={(value) =>
                                            selectName(row.id, value)
                                        }
                                        onCommit={(value) =>
                                            commitName(row.id, value)
                                        }
                                        onOpenSheet={() =>
                                            setSheetRowId(row.id)
                                        }
                                    />
                                    <div className="create-recipe-weight">
                                        <button
                                            type="button"
                                            aria-label={`Decrease ingredient ${index + 1} weight`}
                                            onClick={() =>
                                                updateRow(
                                                    row.id,
                                                    (current) => ({
                                                        ...current,
                                                        weight: String(
                                                            Math.max(
                                                                0,
                                                                (Number(
                                                                    current.weight,
                                                                ) || 0) - 5,
                                                            ),
                                                        ),
                                                    }),
                                                )
                                            }
                                        >
                                            −
                                        </button>
                                        <label className="create-recipe-weight-value">
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                inputMode="decimal"
                                                aria-label={`Ingredient ${index + 1} weight in grams`}
                                                value={row.weight}
                                                onChange={(event) =>
                                                    updateRow(
                                                        row.id,
                                                        (current) => ({
                                                            ...current,
                                                            weight: event.target
                                                                .value,
                                                        }),
                                                    )
                                                }
                                            />
                                            <span aria-hidden="true">g</span>
                                        </label>
                                        <button
                                            type="button"
                                            aria-label={`Increase ingredient ${index + 1} weight`}
                                            onClick={() =>
                                                updateRow(
                                                    row.id,
                                                    (current) => ({
                                                        ...current,
                                                        weight: String(
                                                            (Number(
                                                                current.weight,
                                                            ) || 0) + 5,
                                                        ),
                                                    }),
                                                )
                                            }
                                        >
                                            +
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="create-recipe-remove"
                                        aria-label={`Remove ingredient ${index + 1}`}
                                        onClick={() =>
                                            setRows((current) =>
                                                current.filter(
                                                    (item) =>
                                                        item.id !== row.id,
                                                ),
                                            )
                                        }
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="create-recipe-add"
                            onClick={addRow}
                        >
                            <span aria-hidden="true">+</span> Add ingredient
                        </button>
                    </section>

                    <section
                        className="create-recipe-preview"
                        aria-labelledby="create-recipe-preview-heading"
                    >
                        <h2 id="create-recipe-preview-heading">
                            Nutrition Preview
                        </h2>
                        {ingredients.length ? (
                            <>
                                <NutritionOverview
                                    nutrition={nutrition}
                                    percentages={percentages}
                                />
                                <MealMicronutrients ingredients={ingredients} />
                            </>
                        ) : (
                            <p className="create-recipe-preview-empty">
                                Add an ingredient to see the nutrition preview.
                            </p>
                        )}
                    </section>
                </div>

                <div
                    id={`${tabIdPrefix}-steps-panel`}
                    className="create-recipe-steps-panel"
                    role="tabpanel"
                    aria-labelledby={`${tabIdPrefix}-steps-tab`}
                    hidden={activeTab !== 'steps'}
                >
                    <MealInstructions
                        instructions={steps}
                        editor={{
                            editing: true,
                            canReset: false,
                            onReset: () => {},
                            onChange: (value) => {
                                setSteps(value.split('\n'));
                                setError(undefined);
                            },
                            disabled: saving,
                        }}
                    />
                </div>
            </fieldset>
            {sheetRow && (
                <NutritionDialog
                    key={sheetRow.id}
                    ingredientInfo={{
                        ...(sheetRow.source ?? {}),
                        name: sheetRow.name,
                        ...Object.fromEntries(
                            nutritionFields.map((key) => [
                                key,
                                validAmount(sheetRow.nutrition[key])
                                    ? Number(sheetRow.nutrition[key])
                                    : undefined,
                            ]),
                        ),
                    }}
                    onClose={() => setSheetRowId(null)}
                    onNutritionResolved={(ingredient) =>
                        applySheetNutrition(sheetRow.id, ingredient)
                    }
                    onSave={async (ingredient, saveToUserIngredients) => {
                        if (saveToUserIngredients) {
                            await ingredientCollection?.save(ingredient);
                        }
                        applySheetNutrition(sheetRow.id, ingredient);
                    }}
                />
            )}
        </form>
    );
}
