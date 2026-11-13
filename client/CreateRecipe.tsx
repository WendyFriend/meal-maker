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
import { totalFiber, totalNutrition } from './utils/nutrition';
import NutritionOverview from './meal-generator/components/NutritionOverview';
import MealMicronutrients from './meal-generator/components/MealMicronutrients';
import MealInstructions from './meal-generator/components/MealInstructions';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import SwipeableIngredientRow from './meal-generator/components/SwipeableIngredientRow';
import MealNutritionHighlights from './meal-generator/components/MealNutritionHighlights';
import IngredientCalorieContribution from './meal-generator/components/IngredientCalorieContribution';
import LoadingSpinner from './components/LoadingSpinner';
import { useNutritionLabFoodSearch } from './hooks/useNutritionLabFoodSearch';
import { ingredientDraftFromFoodSearch } from './services/foodSearchService';
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
    source?: IngredientInfo & {
        thumbnailSource?: MealIngredient['thumbnailSource'];
    };
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

function ingredientCalories(row: IngredientRow): number | undefined {
    if (!validAmount(row.weight) || !validAmount(row.nutrition.caloriesPer100g))
        return undefined;

    return (Number(row.weight) * Number(row.nutrition.caloriesPer100g)) / 100;
}

function ingredientCalorieLabel(row: IngredientRow): string {
    const calories = ingredientCalories(row);
    return calories === undefined ? '—' : `${Math.round(calories)} kcal`;
}

function toIngredient(
    row: IngredientRow,
    allowZeroWeight = false,
): MealIngredient | undefined {
    if (
        !row.name.trim() ||
        !validAmount(row.weight) ||
        (!allowZeroWeight && Number(row.weight) <= 0) ||
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
type RecipeSearchOption = {
    key: string;
    name: string;
    label: string;
    source?: IngredientInfo;
};

export function RecipeIngredientNameInput({
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
    onCommit: (value: string, source?: IngredientInfo) => void;
    onOpenSheet: () => void;
}) {
    const listboxId = useId();
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const query = normalizeIngredientName(value);
    const { foods, loading, error } = useNutritionLabFoodSearch(
        value,
        open && !committed,
    );
    const seen = new Set<string>();
    const suggestions = [...savedIngredients, ...commonSuggestions]
        .filter((item) => {
            const key = normalizeIngredientName(item.name);
            if (!query || !key.includes(query) || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);
    const remoteSuggestions = foods
        .filter((food) => {
            const key = normalizeIngredientName(food.name);
            if (
                !normalizeIngredientName(
                    `${food.name} ${food.description}`,
                ).includes(query) ||
                seen.has(key)
            )
                return false;
            seen.add(key);
            return true;
        })
        .slice(0, 6);
    const manualOption: RecipeSearchOption[] =
        query && !seen.has(query)
            ? [
                  {
                      key: 'manual',
                      name: value.trim(),
                      label: `+ ${value.trim()}`,
                  },
              ]
            : [];
    const options: RecipeSearchOption[] = [
        ...manualOption,
        ...suggestions.map((item) => ({
            key: `local:${normalizeIngredientName(item.name)}`,
            name: item.name,
            label: item.name,
            source: item as IngredientInfo,
        })),
        ...remoteSuggestions.map((food) => ({
            key: `food:${food.fdcId}`,
            name: food.name,
            label: food.name,
            source: ingredientDraftFromFoodSearch(food),
        })),
    ];
    const visible = open && query.length > 0 && options.length > 0;
    const activeIndex =
        highlightedIndex >= 0 && highlightedIndex < options.length
            ? highlightedIndex
            : manualOption.length
              ? 0
              : options.findIndex(
                    (option) => normalizeIngredientName(option.name) === query,
                );

    function choose(name: string, source?: IngredientInfo) {
        onCommit(name, source);
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
                        const option =
                            visible && activeIndex >= 0
                                ? options[activeIndex]
                                : undefined;
                        choose(option?.name ?? value.trim(), option?.source);
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
                            key={option.key}
                            id={`${listboxId}-${optionIndex}`}
                            type="button"
                            role="option"
                            aria-label={
                                option.key === 'manual'
                                    ? `Enter ${option.name} manually`
                                    : option.label
                            }
                            aria-selected={activeIndex === optionIndex}
                            className={`ingredient-suggestion create-recipe-suggestion${
                                option.key === 'manual'
                                    ? ' create-recipe-suggestion-manual'
                                    : ''
                            }`}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => choose(option.name, option.source)}
                        >
                            <span>{option.label}</span>
                            {option.key === 'manual' && (
                                <span
                                    className="create-recipe-enter-hint"
                                    aria-hidden="true"
                                >
                                    ↵
                                </span>
                            )}
                        </button>
                    ))}
                    {loading && (
                        <div
                            className="create-recipe-search-status"
                            role="status"
                            aria-label="Searching ingredients"
                        >
                            <LoadingSpinner size="small" />
                        </div>
                    )}
                    {error && (
                        <div
                            className="create-recipe-search-status create-recipe-search-error"
                            role="status"
                        >
                            Nutrition Lab is unavailable. You can enter this
                            ingredient manually.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function CreateRecipe({
    savedIngredients,
    onSave,
    initialRecipe,
    editMode = false,
    formId = 'create-recipe-form',
    onCancel,
}: {
    savedIngredients: UserIngredient[];
    onSave: (recipe: RecipeInput) => Promise<void>;
    initialRecipe?: RecipeInput;
    editMode?: boolean;
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
    const [openSwipeRowId, setOpenSwipeRowId] = useState<number | null>(null);
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
    const previewIngredients = useMemo(
        () =>
            editMode
                ? rows.flatMap((row) => {
                      const ingredient = toIngredient(row, true);
                      return ingredient ? [ingredient] : [];
                  })
                : ingredients,
        [editMode, ingredients, rows],
    );
    const nutrition = useMemo(
        () => totalNutrition(previewIngredients),
        [previewIngredients],
    );
    const fiber = useMemo(
        () => totalFiber(previewIngredients),
        [previewIngredients],
    );
    const [ingredientCalorieScale] = useState(() => {
        const initialCalories = (initialRecipe?.ingredients ?? [])
            .map(
                (ingredient) =>
                    (ingredient.caloriesPer100g * ingredient.weight) / 100,
            )
            .filter(Number.isFinite);
        const largest = Math.max(0, ...initialCalories);
        return Math.max(500, Math.ceil((largest * 2) / 100) * 100);
    });
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

    function commitName(id: number, value: string, selected?: IngredientInfo) {
        const name = value.trim();
        if (!name) return;
        const match =
            selected ??
            savedIngredients.find(
                (item) =>
                    normalizeIngredientName(item.name) ===
                    normalizeIngredientName(name),
            ) ??
            findCommonQuickAddIngredient(name);
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
                    item.id === id &&
                    item.lookingUp &&
                    item.name.trim() === requestedName
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
                    item.id === id &&
                    item.lookingUp &&
                    item.name.trim() === requestedName
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
            className={`create-recipe${editMode ? ' create-recipe-edit' : ''}`}
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

                {editMode && (
                    <MealNutritionHighlights
                        calories={
                            previewIngredients.length
                                ? nutrition.calories
                                : undefined
                        }
                        protein={
                            previewIngredients.length
                                ? nutrition.protein
                                : undefined
                        }
                        fiber={fiber}
                    />
                )}

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
                        Ingredients &amp; Nutrition
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
                        Steps
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
                        className={`create-recipe-ingredients${editMode ? ' meal-ingredients' : ''}`}
                        aria-labelledby="create-recipe-ingredients-heading"
                    >
                        {editMode ? (
                            <div className="meal-section-header">
                                <h2 id="create-recipe-ingredients-heading">
                                    Ingredients
                                </h2>
                            </div>
                        ) : (
                            <h2 id="create-recipe-ingredients-heading">
                                Ingredients
                            </h2>
                        )}
                        <div
                            className={`create-recipe-rows${editMode ? ' ingredient-list' : ''}`}
                        >
                            {rows.map((row, index) => (
                                <SwipeableIngredientRow
                                    key={row.id}
                                    name={row.name || `Ingredient ${index + 1}`}
                                    enabled
                                    open={openSwipeRowId === row.id}
                                    onOpen={() => setOpenSwipeRowId(row.id)}
                                    onClose={() => setOpenSwipeRowId(null)}
                                    onRemove={() => {
                                        setRows((current) =>
                                            current.filter(
                                                (item) => item.id !== row.id,
                                            ),
                                        );
                                        setOpenSwipeRowId(null);
                                        setError(undefined);
                                    }}
                                >
                                    <div
                                        className={`create-recipe-row${editMode ? ' meal-ingredient' : ''}`}
                                    >
                                        <IngredientThumbnail
                                            name={row.name || 'Ingredient'}
                                            fdcId={
                                                row.source?.nutritionSource
                                                    ?.fdcId
                                            }
                                            source={row.source?.thumbnailSource}
                                        />
                                        <div
                                            className={`create-recipe-ingredient-info${editMode ? ' ingredient-info' : ''}`}
                                        >
                                            <RecipeIngredientNameInput
                                                index={index}
                                                value={row.name}
                                                committed={row.committed}
                                                savedIngredients={
                                                    savedIngredients
                                                }
                                                lookingUp={row.lookingUp}
                                                lookupFailed={row.lookupFailed}
                                                focusInput={(node) => {
                                                    if (
                                                        node &&
                                                        focusRow.current ===
                                                            row.id
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
                                                onCommit={(value, source) =>
                                                    commitName(
                                                        row.id,
                                                        value,
                                                        source,
                                                    )
                                                }
                                                onOpenSheet={() =>
                                                    setSheetRowId(row.id)
                                                }
                                            />
                                            {editMode && row.name.trim() && (
                                                <IngredientCalorieContribution
                                                    name={row.name}
                                                    calories={ingredientCalories(
                                                        row,
                                                    )}
                                                    scale={
                                                        ingredientCalorieScale
                                                    }
                                                />
                                            )}
                                        </div>
                                        <div
                                            className={
                                                editMode
                                                    ? 'ingredient-portion-summary'
                                                    : undefined
                                            }
                                        >
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
                                                                        ) ||
                                                                            0) -
                                                                            5,
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
                                                                    weight: event
                                                                        .target
                                                                        .value,
                                                                }),
                                                            )
                                                        }
                                                    />
                                                    <span aria-hidden="true">
                                                        g
                                                    </span>
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
                                            {editMode && (
                                                <span className="ingredient-calorie-value">
                                                    {ingredientCalorieLabel(
                                                        row,
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </SwipeableIngredientRow>
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
                                    fiber={fiber}
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
