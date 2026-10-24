import { useEffect, useMemo, useState } from 'react';
// import type { GenerateMealResponse } from '../../shared/types/types.ts';
import './NewMealResult.css';
import type { GenerateMealResponse } from '../../../shared/types/types';
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
};

type NutrientDefinition = {
    key: 'iron' | 'zinc' | 'calcium' | 'folate' | 'choline' | 'omega3';
    label: string;
    unit: string;
    dailyReference: number;
    decimals: number;
};

const NUTRIENTS: NutrientDefinition[] = [
    {
        key: 'iron',
        label: 'Iron',
        unit: 'mg',
        dailyReference: 18,
        decimals: 1,
    },
    {
        key: 'zinc',
        label: 'Zinc',
        unit: 'mg',
        dailyReference: 11,
        decimals: 1,
    },
    {
        key: 'calcium',
        label: 'Calcium',
        unit: 'mg',
        dailyReference: 1000,
        decimals: 0,
    },
    {
        key: 'folate',
        label: 'Folate',
        unit: 'µg',
        dailyReference: 400,
        decimals: 0,
    },
    {
        key: 'choline',
        label: 'Choline',
        unit: 'mg',
        dailyReference: 550,
        decimals: 0,
    },
    {
        key: 'omega3',
        label: 'Omega-3 (ALA)',
        unit: 'g',
        dailyReference: 1.1,
        decimals: 1,
    },
];

type MacroKey = 'carbohydrate' | 'protein' | 'fat';

type MacroConfig = {
    key: MacroKey;
    label: string;
    segmentClassName: string;
    dotClassName: string;
};

const MACROS: MacroConfig[] = [
    {
        key: 'carbohydrate',
        label: 'Carbs',
        segmentClassName: 'macro-donut-carbs',
        dotClassName: 'macro-dot-carbs',
    },
    {
        key: 'protein',
        label: 'Protein',
        segmentClassName: 'macro-donut-protein',
        dotClassName: 'macro-dot-protein',
    },
    {
        key: 'fat',
        label: 'Fat',
        segmentClassName: 'macro-donut-fat',
        dotClassName: 'macro-dot-fat',
    },
];

export default function MealResult({
    meal,
    originalMeal,
    onChange,
    showBookmark = true,
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
            {
                calories: 0,
                protein: 0,
                carbohydrate: 0,
                fat: 0,
            },
        );
    }, [meal.ingredients]);

    const macroCalories = useMemo(
        () => ({
            carbohydrate: nutrition.carbohydrate * 4,
            protein: nutrition.protein * 4,
            fat: nutrition.fat * 9,
        }),
        [nutrition],
    );

    const macroCaloriesTotal =
        macroCalories.carbohydrate + macroCalories.protein + macroCalories.fat;

    const macroPercentages = useMemo(() => {
        if (macroCaloriesTotal <= 0) {
            return {
                carbohydrate: 0,
                protein: 0,
                fat: 0,
            };
        }

        return {
            carbohydrate:
                (macroCalories.carbohydrate / macroCaloriesTotal) * 100,
            protein: (macroCalories.protein / macroCaloriesTotal) * 100,
            fat: (macroCalories.fat / macroCaloriesTotal) * 100,
        };
    }, [macroCalories, macroCaloriesTotal]);

    const micronutrients = useMemo(() => {
        return NUTRIENTS.map((nutrient) => {
            let total = 0;
            let hasData = false;

            meal.ingredients.forEach((ingredient) => {
                const valuePer100g = getNutrientValue(ingredient, nutrient.key);

                if (valuePer100g !== undefined) {
                    total += valuePer100g * (ingredient.weight / 100);
                    hasData = true;
                }
            });

            if (!hasData) {
                return {
                    ...nutrient,
                    amount: undefined,
                    percentage: undefined,
                };
            }

            const percentage =
                nutrient.dailyReference > 0
                    ? (total / nutrient.dailyReference) * 100
                    : 0;

            return {
                ...nutrient,
                amount: total,
                percentage,
            };
        });
    }, [meal.ingredients]);

    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );

    const [highlightedMacro, setHighlightedMacro] = useState<MacroKey | null>(
        null,
    );
    // Id of the recipes-table row created when this meal was saved.
    // Null means this meal is not bookmarked yet.
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
    const [isSavingMeal, setIsSavingMeal] = useState(false);
    const [bookmarkError, setBookmarkError] = useState<string | null>(null);
    const [nutritionSheetIngredient, setNutritionSheetIngredient] = useState<
        number | null
    >(null);

    // Tapping outside the visible part of the donut (the ring segments, the
    // track, or a legend item) clears the highlight. The donut hole, the
    // corners of the donut box, and chart whitespace all deselect.
    useEffect(() => {
        if (!highlightedMacro) return;

        function handlePointerDown(event: PointerEvent) {
            const target = event.target;

            const isOnVisibleDonut =
                target instanceof Element &&
                target.closest(
                    '.macro-donut-segment, .macro-donut-track, .macro-legend-item',
                ) !== null;

            if (!isOnVisibleDonut) {
                setHighlightedMacro(null);
            }
        }

        document.addEventListener('pointerdown', handlePointerDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [highlightedMacro]);

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

    const highlightedMacroConfig = highlightedMacro
        ? MACROS.find((macro) => macro.key === highlightedMacro)
        : undefined;

    function toggleMacro(macro: MacroKey) {
        setHighlightedMacro((current) => (current === macro ? null : macro));
    }

    function getSegmentClassName(macro: MacroConfig): string {
        const classes = ['macro-donut-segment', macro.segmentClassName];

        if (highlightedMacro === macro.key) {
            classes.push('macro-donut-segment-highlighted');
        } else if (highlightedMacro) {
            classes.push('macro-donut-segment-dimmed');
        }

        return classes.join(' ');
    }

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

                    <div className="meal-total-calories">
                        {Math.round(nutrition.calories)} kcal
                    </div>
                </div>
            </div>

            <p className="meal-result-meta">
                {meal.ingredients.length}{' '}
                {meal.ingredients.length === 1 ? 'ingredient' : 'ingredients'}
                {' \u00b7 '}
                {meal.instructions.length}{' '}
                {meal.instructions.length === 1 ? 'step' : 'steps'}
            </p>

            {/* Nutrition at a glance */}
            <div className="nutrition-summary">
                <div className="nutrition-summary-item">
                    <span className="nutrition-summary-label">Calories</span>
                    <span className="nutrition-summary-value">
                        {Math.round(nutrition.calories)}
                    </span>
                    <span className="nutrition-summary-unit">kcal</span>
                </div>
                <div className="nutrition-summary-item">
                    <span className="nutrition-summary-label">Protein</span>
                    <span className="nutrition-summary-value">
                        {Math.round(nutrition.protein)}
                    </span>
                    <span className="nutrition-summary-unit">g</span>
                </div>
                <div className="nutrition-summary-item">
                    <span className="nutrition-summary-label">Carbs</span>
                    <span className="nutrition-summary-value">
                        {Math.round(nutrition.carbohydrate)}
                    </span>
                    <span className="nutrition-summary-unit">g</span>
                </div>
                <div className="nutrition-summary-item">
                    <span className="nutrition-summary-label">Fat</span>
                    <span className="nutrition-summary-value">
                        {Math.round(nutrition.fat)}
                    </span>
                    <span className="nutrition-summary-unit">g</span>
                </div>
            </div>

            {bookmarkError && (
                <p className="meal-bookmark-error" role="alert">
                    {bookmarkError}
                </p>
            )}
            <div className="meal-result-grid">
                <div className="meal-result-main">

            <section className="meal-ingredients">
                <div className="meal-section-header">
                    <h3>Ingredients</h3>

                    <button
                        type="button"
                        onClick={resetWeights}
                        className="meal-reset-button"
                        disabled={!originalMeal}
                    >
                        Reset
                    </button>
                </div>

                <div className="ingredient-list">
                    {meal.ingredients.map((ingredient, index) => (
                        <div
                            className="meal-ingredient"
                            key={`${ingredient.name}-${index}`}
                        >
                            <div className="ingredient-info">
                                <button
                                    type="button"
                                    className="ingredient-name ingredient-name-button"
                                    onClick={() =>
                                        setNutritionSheetIngredient(index)
                                    }
                                >
                                    {ingredient.name}

                                    <span
                                        className="ingredient-name-chevron"
                                        aria-hidden="true"
                                    />
                                </button>

                                {/* <div className="ingredient-calories">
                                    {Math.round(
                                        (ingredient.caloriesPer100g *
                                            ingredient.weight) /
                                            100,
                                    )}{' '}
                                    kcal
                                </div> */}
                            </div>

                            <div className="ingredient-weight-control">
                                <button
                                    type="button"
                                    onClick={() => adjustWeight(index, -5)}
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
                                        handleWeightInputChange(index, text)
                                    }
                                    onBlur={() => handleWeightInputBlur(index)}
                                />

                                <span>g</span>

                                <button
                                    type="button"
                                    onClick={() => adjustWeight(index, 5)}
                                    aria-label={`Increase ${ingredient.name} by 5 grams`}
                                >
                                    +
                                </button>
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
            <section className="meal-nutrition">
                <h3>Nutrition</h3>

                <div className="macro-chart">
                    <div
                        className="macro-donut"
                        aria-label={`Macro breakdown: ${Math.round(
                            macroPercentages.carbohydrate,
                        )}% carbohydrates, ${Math.round(
                            macroPercentages.protein,
                        )}% protein, ${Math.round(macroPercentages.fat)}% fat`}
                    >
                        <svg
                            viewBox="0 0 120 120"
                            role="img"
                            aria-hidden="true"
                        >
                            <circle
                                className="macro-donut-track"
                                cx="60"
                                cy="60"
                                r="42"
                            />

                            {MACROS.map((macro, index) => {
                                const percentage = macroPercentages[macro.key];

                                const segmentOffset = MACROS.slice(
                                    0,
                                    index,
                                ).reduce(
                                    (offset, previous) =>
                                        offset + macroPercentages[previous.key],
                                    0,
                                );

                                return (
                                    <circle
                                        key={macro.key}
                                        className={getSegmentClassName(macro)}
                                        cx="60"
                                        cy="60"
                                        r="42"
                                        pathLength="100"
                                        style={{
                                            strokeDasharray: `${percentage} ${
                                                100 - percentage
                                            }`,
                                            strokeDashoffset: -segmentOffset,
                                        }}
                                        onClick={() => toggleMacro(macro.key)}
                                    >
                                        <title>{`${macro.label}: ${Math.round(
                                            percentage,
                                        )}% of calories`}</title>
                                    </circle>
                                );
                            })}
                        </svg>

                        <div className="macro-donut-center">
                            {highlightedMacroConfig ? (
                                <>
                                    <strong>
                                        {Math.round(
                                            macroPercentages[
                                                highlightedMacroConfig.key
                                            ],
                                        )}
                                        %
                                    </strong>
                                    <span>
                                        {highlightedMacroConfig.label} ·{' '}
                                        {Math.round(
                                            nutrition[
                                                highlightedMacroConfig.key
                                            ],
                                        )}
                                        g
                                    </span>
                                </>
                            ) : (
                                <>
                                    <strong>
                                        {Math.round(nutrition.calories)}
                                    </strong>
                                    <span>kcal</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="macro-legend">
                        {MACROS.map((macro) => (
                            <MacroLegendItem
                                key={macro.key}
                                macro={macro}
                                percentage={macroPercentages[macro.key]}
                                isActive={highlightedMacro === macro.key}
                                onSelect={() => toggleMacro(macro.key)}
                            />
                        ))}
                    </div>
                </div>

                <div className="nutrition-table-wrapper">
                    <table className="nutrition-table">
                        <thead>
                            <tr>
                                <th>Ingredient</th>
                                <th>kcal</th>
                                <th>P</th>
                                <th>C</th>
                                <th>F</th>
                            </tr>
                        </thead>

                        <tbody>
                            {meal.ingredients.map((ingredient, index) => (
                                <tr
                                    key={`${ingredient.name}-nutrition-${index}`}
                                >
                                    <td>{ingredient.name}</td>

                                    <td>
                                        {Math.round(
                                            (ingredient.caloriesPer100g *
                                                ingredient.weight) /
                                                100,
                                        )}
                                    </td>

                                    <td>
                                        {(
                                            ingredient.proteinPer100g *
                                            (ingredient.weight / 100)
                                        ).toFixed(1)}
                                    </td>

                                    <td>
                                        {(
                                            ingredient.carbohydratePer100g *
                                            (ingredient.weight / 100)
                                        ).toFixed(1)}
                                    </td>

                                    <td>
                                        {(
                                            ingredient.fatPer100g *
                                            (ingredient.weight / 100)
                                        ).toFixed(1)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>

                        <tfoot>
                            <tr>
                                <th>Total</th>
                                <th>{Math.round(nutrition.calories)}</th>
                                <th>{nutrition.protein.toFixed(1)}</th>
                                <th>{nutrition.carbohydrate.toFixed(1)}</th>
                                <th>{nutrition.fat.toFixed(1)}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>

            <details className="key-nutrients">
                <summary>
                    <span>Key nutrients</span>
                </summary>

                <p className="key-nutrients-description">
                    Contribution toward daily reference values.
                </p>

                <div className="nutrient-list">
                    {micronutrients.map((nutrient) => (
                        <div className="nutrient-item" key={nutrient.key}>
                            <div className="nutrient-header">
                                <span className="nutrient-name">
                                    {nutrient.label}
                                </span>

                                {nutrient.amount !== undefined ? (
                                    <span className="nutrient-value">
                                        {formatNutrientAmount(
                                            nutrient.amount,
                                            nutrient.decimals,
                                        )}{' '}
                                        {nutrient.unit}
                                    </span>
                                ) : (
                                    <span className="nutrient-unavailable">
                                        Not available
                                    </span>
                                )}
                            </div>

                            {nutrient.percentage !== undefined && (
                                <div className="nutrient-progress-row">
                                    <div className="nutrient-progress">
                                        <div
                                            className="nutrient-progress-fill"
                                            style={{
                                                width: `${Math.min(
                                                    nutrient.percentage,
                                                    100,
                                                )}%`,
                                            }}
                                        />
                                    </div>

                                    <span className="nutrient-percentage">
                                        {Math.round(nutrient.percentage)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </details>

            <details className="nutrition-information">
                <summary>Ingredient Nutrition Information</summary>
                <p>Nutrition values per 100g of each ingredient.</p>

                <div className="nutrition-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Ingredient</th>
                                <th>kcal</th>
                                <th>P</th>
                                <th>C</th>
                                <th>F</th>
                            </tr>
                        </thead>

                        <tbody>
                            {meal.ingredients.map((ingredient, index) => (
                                <tr key={`${ingredient.name}-source-${index}`}>
                                    <td>{ingredient.name}</td>
                                    <td>{ingredient.caloriesPer100g}</td>
                                    <td>
                                        {ingredient.proteinPer100g.toFixed(1)}g
                                    </td>
                                    <td>
                                        {ingredient.carbohydratePer100g.toFixed(
                                            1,
                                        )}
                                        g
                                    </td>
                                    <td>{ingredient.fatPer100g.toFixed(1)}g</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

type MacroLegendItemProps = {
    macro: MacroConfig;
    percentage: number;
    isActive: boolean;
    onSelect: () => void;
};

function MacroLegendItem({
    macro,
    percentage,
    isActive,
    onSelect,
}: MacroLegendItemProps) {
    return (
        <button
            type="button"
            className={`macro-legend-item${
                isActive ? ' macro-legend-item-active' : ''
            }`}
            onClick={onSelect}
            aria-pressed={isActive}
        >
            <span
                className={`macro-dot ${macro.dotClassName}`}
                aria-hidden="true"
            />

            <span className="macro-legend-text">
                <span className="macro-label">{macro.label}</span>

                <strong>{Math.round(percentage)}%</strong>
            </span>
        </button>
    );
}

function formatNutrientAmount(amount: number, decimals: number): string {
    if (decimals === 0) {
        return Math.round(amount).toString();
    }

    return amount.toFixed(decimals);
}

function getNutrientValue(
    ingredient: GenerateMealResponse['ingredients'][number],
    nutrient: NutrientDefinition['key'],
): number | undefined {
    const ingredientWithMicronutrients =
        ingredient as GenerateMealResponse['ingredients'][number] & {
            ironPer100g?: number;
            zincPer100g?: number;
            calciumPer100g?: number;
            folatePer100g?: number;
            cholinePer100g?: number;
            omega3Per100g?: number;
        };

    switch (nutrient) {
        case 'iron':
            return ingredientWithMicronutrients.ironPer100g;

        case 'zinc':
            return ingredientWithMicronutrients.zincPer100g;

        case 'calcium':
            return ingredientWithMicronutrients.calciumPer100g;

        case 'folate':
            return ingredientWithMicronutrients.folatePer100g;

        case 'choline':
            return ingredientWithMicronutrients.cholinePer100g;

        case 'omega3':
            return ingredientWithMicronutrients.omega3Per100g;

        default:
            return undefined;
    }
}
