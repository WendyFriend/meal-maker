import { useMemo, useState } from 'react';
import './NewMealResult.css';
import type {
    GenerateMealResponse,
    MealVariation,
} from '../../../shared/types/types';
import { IngredientWeightInput } from './IngredientWeightInput';
import IngredientNutritionSheet from './IngredientNutritionSheet';
import { deleteRecipe, saveRecipe } from '../../services/recipeService';

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

const REGENERATE_ACTIONS: { variation: MealVariation; label: string }[] = [
    { variation: 'different', label: 'Try another' },
    { variation: 'higher-protein', label: 'Higher protein' },
    { variation: 'lower-calorie', label: 'Lower calorie' },
];

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

type KeyNutrientKey = 'sugarPer100g' | 'saturatedFatPer100g' | 'fiberPer100g';

const KEY_NUTRIENTS: { key: KeyNutrientKey; label: string }[] = [
    { key: 'sugarPer100g', label: 'Sugar' },
    { key: 'saturatedFatPer100g', label: 'Saturated fat' },
    { key: 'fiberPer100g', label: 'Fibre' },
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

    // Totals for the optional nutrients. `partial` means some ingredients
    // have no value, so the total is a lower bound.
    const keyNutrients = useMemo(
        () =>
            KEY_NUTRIENTS.map(({ key, label }) => {
                let total = 0;
                let known = 0;

                meal.ingredients.forEach((ingredient) => {
                    const value = ingredient[key];

                    if (typeof value === 'number') {
                        total += value * (ingredient.weight / 100);
                        known += 1;
                    }
                });

                return {
                    key,
                    label,
                    total: known > 0 ? total : undefined,
                    partial: known > 0 && known < meal.ingredients.length,
                };
            }),
        [meal.ingredients],
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
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
    const [isSavingMeal, setIsSavingMeal] = useState(false);
    const [bookmarkError, setBookmarkError] = useState<string | null>(null);
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

    // Saving writes the meal to the recipes table; un-saving deletes the row.
    // The icon only flips after the database call succeeds, so it always
    // reflects what is actually stored.
    async function toggleBookmark() {
        if (isSavingMeal) return;

        setBookmarkError(null);
        setIsSavingMeal(true);

        try {
            if (savedRecipeId) {
                await deleteRecipe(savedRecipeId);
                setSavedRecipeId(null);
            } else {
                const savedRecipe = await saveRecipe({
                    recipeName: meal.mealName,
                    ingredients: meal.ingredients,
                    instructions: meal.instructions,
                    servings: meal.servings,
                });

                if (!savedRecipe.id) {
                    throw new Error('saveRecipe did not return a recipe id');
                }

                setSavedRecipeId(savedRecipe.id);
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

            {onRegenerate && (
                <div
                    className="meal-regenerate"
                    role="group"
                    aria-label="Generate a different version"
                >
                    {REGENERATE_ACTIONS.map(({ variation, label }) => (
                        <button
                            key={variation}
                            type="button"
                            className="meal-regenerate-button"
                            onClick={() => onRegenerate(variation)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {bookmarkError && (
                <p className="meal-bookmark-error" role="alert">
                    {bookmarkError}
                </p>
            )}

            {/* Nutrition at a glance: totals plus the energy split */}
            <section className="meal-summary" aria-label="Nutrition summary">
                <div className="nutrition-summary">
                    {summaryStats.map((stat) => (
                        <div
                            className="nutrition-summary-item"
                            key={stat.label}
                        >
                            <span className="nutrition-summary-label">
                                {stat.label}
                            </span>
                            <span className="nutrition-summary-value">
                                {Math.round(stat.value)}
                                <span className="nutrition-summary-unit">
                                    {stat.unit}
                                </span>
                            </span>
                            {stat.percentage !== undefined && (
                                <span className="nutrition-summary-share">
                                    {Math.round(stat.percentage)}%
                                    <span className="nutrition-summary-share-suffix">
                                        {' of energy'}
                                    </span>
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                <div
                    className="macro-bar"
                    role="img"
                    aria-label={`Energy split: ${energySplitLabel}`}
                >
                    {MACROS.map((macro) => (
                        <span
                            key={macro.key}
                            className={`macro-bar-segment ${macro.colorClassName}`}
                            style={{ flexGrow: macroPercentages[macro.key] }}
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
                            <span className="macro-legend-values">
                                {Math.round(nutrition[macro.key])} g{' · '}
                                {Math.round(macroPercentages[macro.key])}%
                            </span>
                        </li>
                    ))}
                </ul>
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
                                            </div>

                                            <div className="ingredient-meta">
                                                <span>
                                                    {Math.round(calories)} kcal
                                                    {' · '}
                                                    {Math.round(protein)} g
                                                    protein
                                                </span>

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
                                    By ingredient, totals and key nutrients
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
                                Key nutrients
                            </h4>

                            <dl className="key-nutrients">
                                {keyNutrients.map((nutrient) => (
                                    <div
                                        className="key-nutrient"
                                        key={nutrient.key}
                                    >
                                        <dt>{nutrient.label}</dt>
                                        {nutrient.total !== undefined ? (
                                            <dd>
                                                {nutrient.total.toFixed(1)} g
                                                {nutrient.partial && (
                                                    <span className="key-nutrient-partial">
                                                        some missing
                                                    </span>
                                                )}
                                            </dd>
                                        ) : (
                                            <dd className="key-nutrient-unavailable">
                                                Not available
                                            </dd>
                                        )}
                                    </div>
                                ))}
                            </dl>
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
        </section>
    );
}
