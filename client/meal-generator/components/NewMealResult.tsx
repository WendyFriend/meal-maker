import { useMemo, useState } from 'react';
import './NewMealResult.css';
import type {
    GenerateMealResponse,
    MealIngredient,
    MealType,
    MealVariation,
} from '../../../shared/types/types';
import { sumMicronutrients } from '../../../shared/nutrition/nutrients';
import { getPrepConsiderations } from '../../../shared/nutrition/prepGuidance';
import { thumbnailUrl } from '../../../shared/nutrition/thumbnail';
import AnimatedNumber from './AnimatedNumber';
import { IngredientWeightInput } from './IngredientWeightInput';
import IngredientNutritionSheet from './IngredientNutritionSheet';
import NutrientList from './NutrientList';
import PrepNotes from './PrepNotes';
import AddToPlanSheet, { type AddToPlanResult } from './AddToPlanSheet';
import { getIngredientMicronutrients, hasMicronutrients } from './nutrientRows';
import {
    countRecipes,
    deleteRecipe,
    saveRecipe,
} from '../../services/recipeService';
import { addEntry } from '../../services/mealPlanService';
import { usePlan } from '../../plan/PlanContext';
import UpgradeNotice from '../../plan/UpgradeNotice';

type MealResultProps = {
    meal: GenerateMealResponse;
    originalMeal?: GenerateMealResponse;
    onChange: (meal: GenerateMealResponse) => void;
    /* Hide the save/unsave bookmark, e.g. on the recipe detail page
       where the meal is already saved. */
    showBookmark?: boolean;
    /* Re-run generation with a tweak ("Try another" etc.). Hidden when
       omitted, e.g. on the recipe detail page. */
    onRegenerate?: (variation: MealVariation) => void;
    /* The meal type chosen for the meal; saved with it and used to pick the
       meal period in "Add to plan". */
    mealType?: MealType;
    /* Id of the stored recipe when the meal is already saved (the recipe
       detail page), so "Add to plan" does not save a second copy. */
    savedRecipeId?: string;
    /* Ingredients whose nutrition the server estimated; each gets an
       "Add nutrition" action. */
    estimatedIngredients?: string[];
    onAddEstimatedNutrition?: (ingredientName: string) => void;
    /* Persist weight edits of an already saved recipe. */
    saveChanges?: {
        hasChanges: boolean;
        status: 'idle' | 'saving' | 'saved' | 'error';
        onSave: () => void;
    };
};

const REGENERATE_ACTIONS: {
    variation: MealVariation;
    label: string;
    // Needs a plan with limits.variations.
    gated?: boolean;
}[] = [
    { variation: 'different', label: 'Try another' },
    { variation: 'higher-protein', label: 'Higher protein', gated: true },
    { variation: 'lower-calorie', label: 'Lower calorie', gated: true },
];

const SOURCE_LABELS: Record<
    NonNullable<MealIngredient['nutritionSource']>,
    string
> = {
    usda: 'Database',
    user: 'Yours',
    estimated: 'Estimated',
};

type MacroKey = 'carbohydrate' | 'protein' | 'fat';

type MacroConfig = {
    key: MacroKey;
    label: string;
    colorClassName: string;
};

const MACROS: MacroConfig[] = [
    { key: 'carbohydrate', label: 'Carbs', colorClassName: 'macro-carbs' },
    { key: 'protein', label: 'Protein', colorClassName: 'macro-protein' },
    { key: 'fat', label: 'Fat', colorClassName: 'macro-fat' },
];

function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}

export default function MealResult({
    meal,
    originalMeal,
    onChange,
    showBookmark = true,
    onRegenerate,
    mealType,
    savedRecipeId: initialSavedRecipeId,
    estimatedIngredients,
    onAddEstimatedNutrition,
    saveChanges,
}: MealResultProps) {
    const nutrition = useMemo(() => {
        return meal.ingredients.reduce(
            (totals, ingredient) => {
                const multiplier = ingredient.weight / 100;

                totals.calories += ingredient.caloriesPer100g * multiplier;
                totals.protein += ingredient.proteinPer100g * multiplier;
                totals.carbohydrate +=
                    ingredient.carbohydratePer100g * multiplier;
                totals.fat += ingredient.fatPer100g * multiplier;

                return totals;
            },
            { calories: 0, protein: 0, carbohydrate: 0, fat: 0 },
        );
    }, [meal.ingredients]);

    // Share of energy from each macro (4/4/9 kcal per gram).
    const macroPercentages = useMemo(() => {
        const energy = {
            carbohydrate: nutrition.carbohydrate * 4,
            protein: nutrition.protein * 4,
            fat: nutrition.fat * 9,
        };
        const total = energy.carbohydrate + energy.protein + energy.fat;

        if (total <= 0) {
            return { carbohydrate: 0, protein: 0, fat: 0 };
        }

        return {
            carbohydrate: (energy.carbohydrate / total) * 100,
            protein: (energy.protein / total) * 100,
            fat: (energy.fat / total) * 100,
        };
    }, [nutrition]);

    // Vitamins, minerals and fats for one serving, and how many of the
    // ingredients have data behind them.
    const nutrientAmounts = useMemo(
        () =>
            sumMicronutrients(
                meal.ingredients.map((ingredient) => ({
                    weight: ingredient.weight,
                    micronutrientsPer100g:
                        getIngredientMicronutrients(ingredient),
                })),
            ),
        [meal.ingredients],
    );
    const nutrientCoverage = useMemo(
        () => ({
            known: meal.ingredients.filter(hasMicronutrients).length,
            total: meal.ingredients.length,
        }),
        [meal.ingredients],
    );

    // Preparation guidance comes with the meal; saved and older meals work
    // it out from the ingredient names.
    const considerations = useMemo(
        () =>
            meal.considerations ??
            getPrepConsiderations(
                meal.ingredients.map((ingredient) => ingredient.name),
            ),
        [meal.considerations, meal.ingredients],
    );

    const estimatedNames = useMemo(
        () => new Set((estimatedIngredients ?? []).map(normalizeName)),
        [estimatedIngredients],
    );

    // Estimated names that match no ingredient row still need their action.
    const unmatchedEstimated = (estimatedIngredients ?? []).filter(
        (name) =>
            !meal.ingredients.some(
                (ingredient) =>
                    normalizeName(ingredient.name) === normalizeName(name),
            ),
    );

    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );

    // Id of the recipes-table row created when this meal was saved.
    // Null means this meal is not bookmarked yet.
    // Details start open where there's a column for them (desktop) and
    // closed on phones, where they'd push the steps far down. Only the
    // initial value is set; the user's toggling is left to <details>.
    const [detailsInitiallyOpen] = useState(
        () => window.matchMedia?.('(min-width: 901px)').matches ?? false,
    );
    const { limits, openPlans } = usePlan();
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(
        initialSavedRecipeId ?? null,
    );
    const [isSavingMeal, setIsSavingMeal] = useState(false);
    const [bookmarkError, setBookmarkError] = useState<string | null>(null);
    // The plan's saved-meal limit stopped the last save.
    const [isSaveLimitReached, setIsSaveLimitReached] = useState(false);
    const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false);
    const [nutritionSheetIngredient, setNutritionSheetIngredient] = useState<
        number | null
    >(null);

    function updateWeight(index: number, weight: number) {
        const ingredients = meal.ingredients.map(
            (ingredient, ingredientIndex) =>
                ingredientIndex === index
                    ? { ...ingredient, weight }
                    : ingredient,
        );

        onChange({
            ...meal,
            ingredients,
        });
    }

    function adjustWeight(index: number, amount: number) {
        const ingredient = meal.ingredients[index];

        if (!ingredient) return;

        const newWeight = Math.max(0, ingredient.weight + amount);

        // Discard any unfinished draft when using +/-.
        setWeightDrafts((drafts) => {
            const next = { ...drafts };
            delete next[index];
            return next;
        });

        updateWeight(index, newWeight);
    }

    function handleWeightInputChange(index: number, text: string) {
        setWeightDrafts((drafts) => ({
            ...drafts,
            [index]: text,
        }));

        // An empty string is allowed while editing.
        if (text === '') {
            updateWeight(index, 0);
            return;
        }

        const value = Number(text);

        if (Number.isFinite(value) && value >= 0) {
            updateWeight(index, value);
        }
    }

    function handleWeightInputBlur(index: number) {
        const text = weightDrafts[index];

        if (text === '') {
            updateWeight(index, 0);
        }

        setWeightDrafts((drafts) => {
            const next = { ...drafts };
            delete next[index];
            return next;
        });
    }

    const isBookmarked = savedRecipeId !== null;

    // Stores the meal as a saved recipe unless it already is one. Returns
    // null (and flags the limit) when the plan's saved-meal limit is reached.
    async function ensureSaved(): Promise<string | null> {
        if (savedRecipeId) return savedRecipeId;

        if (
            limits.savedMeals !== null &&
            (await countRecipes()) >= limits.savedMeals
        ) {
            setIsSaveLimitReached(true);
            return null;
        }

        const savedRecipe = await saveRecipe({
            recipeName: meal.mealName,
            ingredients: meal.ingredients,
            instructions: meal.instructions,
            servings: meal.servings,
            source: 'generated',
            mealType,
        });

        if (!savedRecipe.id) {
            throw new Error('saveRecipe did not return a recipe id');
        }

        setSavedRecipeId(savedRecipe.id);
        return savedRecipe.id;
    }

    // Saving writes the meal to the recipes table; un-saving deletes the row.
    // The icon only flips after the database call succeeds, so it always
    // reflects what is actually stored.
    async function toggleBookmark() {
        if (isSavingMeal) return;

        setBookmarkError(null);
        setIsSaveLimitReached(false);
        setIsSavingMeal(true);

        try {
            if (savedRecipeId) {
                await deleteRecipe(savedRecipeId);
                setSavedRecipeId(null);
            } else {
                await ensureSaved();
            }
        } catch (error) {
            console.error('Failed to toggle saved meal:', error);
            setBookmarkError(
                savedRecipeId
                    ? 'Could not remove this meal. Please try again.'
                    : 'Could not save this meal. Please try again.',
            );
        } finally {
            setIsSavingMeal(false);
        }
    }

    // Saves the meal first if needed, then puts it on the chosen day.
    async function addToPlan(
        planDate: string,
        slot: string,
    ): Promise<AddToPlanResult> {
        try {
            const recipeId = await ensureSaved();

            if (!recipeId) return 'limit';

            await addEntry(planDate, slot, recipeId, 1);
            return 'added';
        } catch (error) {
            console.error('Failed to add meal to plan:', error);
            return 'error';
        }
    }

    function regenerate(variation: MealVariation, gated: boolean | undefined) {
        if (gated && !limits.variations) {
            openPlans('Meal variations');
            return;
        }

        onRegenerate?.(variation);
    }

    function resetWeights() {
        if (!originalMeal) return;
        setWeightDrafts({});

        onChange({
            ...originalMeal,
            ingredients: originalMeal.ingredients.map((ingredient) => ({
                ...ingredient,
            })),
        });
    }

    const summaryStats: {
        label: string;
        value: number;
        unit: string;
        percentage?: number;
    }[] = [
        { label: 'Calories', value: nutrition.calories, unit: 'kcal' },
        {
            label: 'Protein',
            value: nutrition.protein,
            unit: 'g',
            percentage: macroPercentages.protein,
        },
        {
            label: 'Carbs',
            value: nutrition.carbohydrate,
            unit: 'g',
            percentage: macroPercentages.carbohydrate,
        },
        {
            label: 'Fat',
            value: nutrition.fat,
            unit: 'g',
            percentage: macroPercentages.fat,
        },
    ];

    const energySplitLabel = MACROS.map(
        (macro) =>
            `${Math.round(macroPercentages[macro.key])}% ${macro.label.toLowerCase()}`,
    ).join(', ');

    return (
        <section className="meal-result">
            <div className="meal-result-header">
                <div className="meal-result-title-block">
                    <p className="meal-result-eyebrow">Your recipe</p>
                    <h2>{meal.mealName}</h2>
                </div>

                <div className="meal-result-actions">
                    {showBookmark && (
                        <button
                            type="button"
                            className="meal-bookmark-button"
                            onClick={toggleBookmark}
                            disabled={isSavingMeal}
                            aria-pressed={isBookmarked}
                            aria-label={
                                isBookmarked
                                    ? 'Remove this meal from saved'
                                    : 'Save this meal'
                            }
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <p className="meal-result-meta">
                {meal.ingredients.length}{' '}
                {meal.ingredients.length === 1 ? 'ingredient' : 'ingredients'}
                {' · '}
                {meal.instructions.length}{' '}
                {meal.instructions.length === 1 ? 'step' : 'steps'}
                {(meal.servings ?? 1) > 1 && (
                    <>
                        {' · '}
                        Serves {meal.servings}
                        {' · '}
                        nutrition per serving
                    </>
                )}
            </p>

            <div className="meal-result-toolbar">
                <button
                    type="button"
                    className="meal-add-to-plan-button"
                    onClick={() => setIsAddToPlanOpen(true)}
                >
                    <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <rect x="4" y="5" width="16" height="15" rx="2.5" />
                        <path d="M4 10h16M8 3v4M16 3v4M12 13v4M10 15h4" />
                    </svg>
                    Add to plan
                </button>

                {onRegenerate && (
                    <div
                        className="meal-regenerate"
                        role="group"
                        aria-label="Generate a different version"
                    >
                        {REGENERATE_ACTIONS.map(
                            ({ variation, label, gated }) => {
                                const isLocked = gated && !limits.variations;

                                return (
                                    <button
                                        key={variation}
                                        type="button"
                                        className={`meal-regenerate-button${
                                            isLocked
                                                ? ' meal-regenerate-button-locked'
                                                : ''
                                        }`}
                                        onClick={() =>
                                            regenerate(variation, gated)
                                        }
                                        title={
                                            isLocked
                                                ? 'Included with Pro'
                                                : undefined
                                        }
                                    >
                                        {isLocked && (
                                            <svg
                                                viewBox="0 0 24 24"
                                                aria-hidden="true"
                                                focusable="false"
                                            >
                                                <rect
                                                    x="5"
                                                    y="11"
                                                    width="14"
                                                    height="9"
                                                    rx="2"
                                                />
                                                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                                            </svg>
                                        )}
                                        {label}
                                        {isLocked && (
                                            <span className="visually-hidden">
                                                {' '}
                                                (Pro feature)
                                            </span>
                                        )}
                                    </button>
                                );
                            },
                        )}
                    </div>
                )}
            </div>

            {bookmarkError && (
                <p className="meal-bookmark-error" role="alert">
                    {bookmarkError}
                </p>
            )}

            {isSaveLimitReached && (
                <div className="meal-save-limit">
                    <UpgradeNotice
                        feature="Saved meal limit reached"
                        description={`Your plan keeps up to ${limits.savedMeals} saved meals. Upgrade for unlimited, or delete one you no longer need.`}
                        compact
                    />
                </div>
            )}

            {/* Nutrition at a glance.
                Calories lead on their own; the three macros sit beside the
                energy split they describe. The bars carry the proportions and
                the tiles carry the grams, so neither has to repeat the other's
                numbers. */}
            <section className="meal-summary" aria-label="Nutrition summary">
                <div className="meal-summary-lead">
                    <span className="meal-summary-label">Calories</span>
                    <span className="meal-summary-calories">
                        <AnimatedNumber value={nutrition.calories} />
                        <span className="meal-summary-unit">kcal</span>
                    </span>
                    <span className="meal-summary-per">per serving</span>
                </div>

                <div className="meal-summary-macros">
                    {summaryStats
                        .filter((stat) => stat.percentage !== undefined)
                        .map((stat) => (
                            <div className="meal-macro" key={stat.label}>
                                <span className="meal-macro-label">
                                    {stat.label}
                                </span>
                                <span className="meal-macro-value">
                                    <AnimatedNumber value={stat.value} />
                                    <span className="meal-macro-unit">
                                        {stat.unit}
                                    </span>
                                </span>
                                <span className="meal-macro-share">
                                    <AnimatedNumber
                                        value={stat.percentage ?? 0}
                                    />
                                    % of energy
                                </span>
                            </div>
                        ))}
                </div>

                <div className="meal-summary-split">
                    <div
                        className="macro-bar"
                        role="img"
                        aria-label={`Energy split: ${energySplitLabel}`}
                    >
                        {MACROS.map((macro) => (
                            <span
                                key={macro.key}
                                className={`macro-bar-segment ${macro.colorClassName}`}
                                style={{
                                    flexGrow: macroPercentages[macro.key],
                                }}
                            />
                        ))}
                    </div>

                    <ul className="macro-legend">
                        {MACROS.map((macro) => (
                            <li className="macro-legend-item" key={macro.key}>
                                <span
                                    className={`macro-dot ${macro.colorClassName}`}
                                    aria-hidden="true"
                                />
                                <span className="macro-label">{macro.label}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <div className="meal-result-grid">
                <div className="meal-result-main">
                    <section className="meal-ingredients">
                        <div className="meal-section-header">
                            <h3>Ingredients</h3>

                            <div className="meal-section-actions">
                                {saveChanges?.status === 'error' && (
                                    <span
                                        className="meal-save-status"
                                        role="alert"
                                    >
                                        Could not save
                                    </span>
                                )}
                                {saveChanges?.status === 'saved' &&
                                    !saveChanges.hasChanges && (
                                        <span
                                            className="meal-save-status meal-save-status-ok"
                                            role="status"
                                        >
                                            Saved
                                        </span>
                                    )}
                                <button
                                    type="button"
                                    onClick={resetWeights}
                                    className="meal-reset-button"
                                    disabled={!originalMeal}
                                >
                                    Reset
                                </button>
                                {saveChanges?.hasChanges && (
                                    <button
                                        type="button"
                                        className="meal-save-changes-button"
                                        onClick={saveChanges.onSave}
                                        disabled={
                                            saveChanges.status === 'saving'
                                        }
                                    >
                                        {saveChanges.status === 'saving'
                                            ? 'Saving…'
                                            : 'Save changes'}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="ingredient-list">
                            {meal.ingredients.map((ingredient, index) => {
                                const multiplier = ingredient.weight / 100;
                                const calories =
                                    ingredient.caloriesPer100g * multiplier;
                                const protein =
                                    ingredient.proteinPer100g * multiplier;
                                const share =
                                    nutrition.calories > 0
                                        ? (calories / nutrition.calories) * 100
                                        : 0;
                                const isEstimated = estimatedNames.has(
                                    normalizeName(ingredient.name),
                                );

                                return (
                                    <div
                                        className="meal-ingredient"
                                        key={`${ingredient.name}-${index}`}
                                    >
                                        {ingredient.usda && (
                                            <button
                                                type="button"
                                                className="ingredient-thumb-button"
                                                aria-label={`View ${ingredient.name} and its nutrition`}
                                                onClick={() =>
                                                    setNutritionSheetIngredient(
                                                        index,
                                                    )
                                                }
                                            >
                                                <img
                                                    className="ingredient-thumb"
                                                    src={thumbnailUrl(
                                                        ingredient.usda.fdcId,
                                                    )}
                                                    alt=""
                                                    loading="lazy"
                                                    onError={(e) =>
                                                        e.currentTarget.parentElement?.remove()
                                                    }
                                                />
                                            </button>
                                        )}

                                        <div className="ingredient-info">
                                            <div className="ingredient-title">
                                                <button
                                                    type="button"
                                                    className="ingredient-name ingredient-name-button"
                                                    onClick={() =>
                                                        setNutritionSheetIngredient(
                                                            index,
                                                        )
                                                    }
                                                >
                                                    {ingredient.name}

                                                    <span
                                                        className="ingredient-name-chevron"
                                                        aria-hidden="true"
                                                    />
                                                </button>

                                                {isEstimated && (
                                                    <span className="ingredient-estimated-badge">
                                                        Estimated
                                                    </span>
                                                )}
                                                {ingredient.fixed && (
                                                    <span
                                                        className="ingredient-fixed-badge"
                                                        title="The amount you asked for; the other ingredients were sized around it"
                                                    >
                                                        Your amount
                                                    </span>
                                                )}
                                            </div>

                                            <div className="ingredient-meta">
                                                <span>
                                                    {Math.round(calories)} kcal
                                                    {' · '}
                                                    {Math.round(protein)} g
                                                    protein
                                                </span>

                                                {ingredient.nutritionSource &&
                                                    !isEstimated && (
                                                        <span
                                                            className={`ingredient-source-tag ingredient-source-${ingredient.nutritionSource}`}
                                                            title={
                                                                ingredient.usda
                                                                    ?.description
                                                            }
                                                        >
                                                            {
                                                                SOURCE_LABELS[
                                                                    ingredient
                                                                        .nutritionSource
                                                                ]
                                                            }
                                                        </span>
                                                    )}

                                                {isEstimated && (
                                                    <button
                                                        type="button"
                                                        className="ingredient-add-nutrition"
                                                        onClick={() =>
                                                            onAddEstimatedNutrition?.(
                                                                ingredient.name,
                                                            )
                                                        }
                                                        aria-label={`Add nutrition for ${ingredient.name}`}
                                                    >
                                                        Add nutrition
                                                    </button>
                                                )}
                                            </div>

                                            <div
                                                className="ingredient-share"
                                                title={`${Math.round(share)}% of the meal's calories`}
                                                aria-hidden="true"
                                            >
                                                <div
                                                    className="ingredient-share-fill"
                                                    style={{
                                                        width: `${Math.min(share, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="ingredient-weight-control">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    adjustWeight(index, -5)
                                                }
                                                aria-label={`Decrease ${ingredient.name} by 5 grams`}
                                            >
                                                −
                                            </button>
                                            <IngredientWeightInput
                                                value={
                                                    weightDrafts[index] ??
                                                    String(ingredient.weight)
                                                }
                                                name={ingredient.name}
                                                onChange={(text) =>
                                                    handleWeightInputChange(
                                                        index,
                                                        text,
                                                    )
                                                }
                                                onBlur={() =>
                                                    handleWeightInputBlur(index)
                                                }
                                            />

                                            <span>g</span>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    adjustWeight(index, 5)
                                                }
                                                aria-label={`Increase ${ingredient.name} by 5 grams`}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {unmatchedEstimated.map((name) => (
                                <div
                                    className="meal-ingredient"
                                    key={`estimated-${name}`}
                                >
                                    <div className="ingredient-info">
                                        <div className="ingredient-title">
                                            <span className="ingredient-name">
                                                {name}
                                            </span>
                                            <span className="ingredient-estimated-badge">
                                                Estimated
                                            </span>
                                        </div>
                                        <div className="ingredient-meta">
                                            <button
                                                type="button"
                                                className="ingredient-add-nutrition"
                                                onClick={() =>
                                                    onAddEstimatedNutrition?.(
                                                        name,
                                                    )
                                                }
                                                aria-label={`Add nutrition for ${name}`}
                                            >
                                                Add nutrition
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="meal-prep">
                        <PrepNotes
                            considerations={considerations}
                            heading="Preparation & safety"
                            description="Worth knowing before you cook."
                        />
                    </div>

                    <section className="meal-instructions">
                        <h3>How to make it</h3>

                        <ol>
                            {meal.instructions.map((instruction, index) => (
                                <li key={index}>{instruction}</li>
                            ))}
                        </ol>
                    </section>
                </div>

                <aside className="meal-result-side">
                    <details
                        className="nutrition-details"
                        open={detailsInitiallyOpen}
                    >
                        <summary>
                            <span className="nutrition-details-text">
                                <span className="nutrition-details-title">
                                    Nutrition details
                                </span>
                                <span className="nutrition-details-hint">
                                    By ingredient, plus fats, minerals and
                                    vitamins
                                </span>
                            </span>
                        </summary>

                        <div className="nutrition-details-body">
                            <div className="nutrition-table-wrapper">
                                <table className="nutrition-table">
                                    <caption className="visually-hidden">
                                        Nutrition by ingredient
                                        {(meal.servings ?? 1) > 1
                                            ? ', per serving'
                                            : ''}
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Ingredient</th>
                                            <th scope="col">kcal</th>
                                            <th scope="col">Protein</th>
                                            <th scope="col">Carbs</th>
                                            <th scope="col">Fat</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {meal.ingredients.map(
                                            (ingredient, index) => {
                                                const multiplier =
                                                    ingredient.weight / 100;

                                                return (
                                                    <tr
                                                        key={`${ingredient.name}-nutrition-${index}`}
                                                    >
                                                        <th scope="row">
                                                            {ingredient.name}
                                                        </th>
                                                        <td>
                                                            {Math.round(
                                                                ingredient.caloriesPer100g *
                                                                    multiplier,
                                                            )}
                                                        </td>
                                                        <td>
                                                            {(
                                                                ingredient.proteinPer100g *
                                                                multiplier
                                                            ).toFixed(1)}
                                                        </td>
                                                        <td>
                                                            {(
                                                                ingredient.carbohydratePer100g *
                                                                multiplier
                                                            ).toFixed(1)}
                                                        </td>
                                                        <td>
                                                            {(
                                                                ingredient.fatPer100g *
                                                                multiplier
                                                            ).toFixed(1)}
                                                        </td>
                                                    </tr>
                                                );
                                            },
                                        )}
                                    </tbody>

                                    <tfoot>
                                        <tr>
                                            <th scope="row">Total</th>
                                            <td>
                                                {Math.round(nutrition.calories)}
                                            </td>
                                            <td>
                                                {nutrition.protein.toFixed(1)}
                                            </td>
                                            <td>
                                                {nutrition.carbohydrate.toFixed(
                                                    1,
                                                )}
                                            </td>
                                            <td>{nutrition.fat.toFixed(1)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <p className="nutrition-details-caption">
                                Protein, carbs and fat in grams, at the amounts
                                above. Open an ingredient for its values per 100
                                g.
                            </p>

                            <h4 className="key-nutrients-title">
                                Fats, minerals and vitamins
                            </h4>

                            <NutrientList
                                amounts={nutrientAmounts}
                                coverage={nutrientCoverage}
                                basis={
                                    (meal.servings ?? 1) > 1
                                        ? 'per serving'
                                        : 'for this meal'
                                }
                            />
                        </div>
                    </details>
                </aside>
            </div>

            {nutritionSheetIngredient !== null && (
                <IngredientNutritionSheet
                    ingredient={meal.ingredients[nutritionSheetIngredient]}
                    onClose={() => setNutritionSheetIngredient(null)}
                />
            )}

            {isAddToPlanOpen && (
                <AddToPlanSheet
                    mealName={meal.mealName}
                    mealType={mealType}
                    onAdd={addToPlan}
                    onClose={() => setIsAddToPlanOpen(false)}
                />
            )}
        </section>
    );
}
