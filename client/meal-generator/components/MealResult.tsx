import { totalNutrition } from '../../utils/nutrition';
import { useMemo, useState } from 'react';
import './MealResult.css';
import LogMealButton, {
    type JournalControl,
} from '../../journal/LogMealButton';
import ResetIcon from '../../components/ResetIcon';
import type { GenerateMealResponse } from '../../../shared/types/types';
import { IngredientWeightInput } from './IngredientWeightInput';
import IngredientNutritionSheet from './IngredientNutritionSheet';
import IngredientThumbnail from './IngredientThumbnail';
import NutritionOverview from './NutritionOverview';
import MealMicronutrients from './MealMicronutrients';
import MealInstructions, { type InstructionEditor } from './MealInstructions';
import { deleteRecipe, saveRecipe } from '../../services/recipeService';

type MealResultProps = {
    meal: GenerateMealResponse;
    originalMeal?: GenerateMealResponse;
    onChange: (meal: GenerateMealResponse) => void;
    /* Hide the save action, e.g. on the recipe detail page
       where the meal is already saved. */
    showBookmark?: boolean;
    showWeightControls?: boolean;
    instructionEditor?: InstructionEditor;
    journalControl?: JournalControl;
    showJournalButton?: boolean;
    onNameChange?: (name: string) => void;
};

export default function MealResult({
    meal,
    originalMeal,
    onChange,
    showBookmark = true,
    showWeightControls = true,
    instructionEditor,
    journalControl,
    showJournalButton = true,
    onNameChange,
}: MealResultProps) {
    const nutrition = useMemo(
        () => totalNutrition(meal.ingredients),
        [meal.ingredients],
    );

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

    // Freeze the comparison scale for this meal so editing one weight cannot
    // resize another ingredient's bar. Leave headroom for portion adjustments.
    const [ingredientCalorieScale] = useState(() => {
        const largest = Math.max(
            0,
            ...(originalMeal ?? meal).ingredients.map(
                (ingredient) =>
                    (ingredient.caloriesPer100g * ingredient.weight) / 100,
            ),
        );
        return Math.max(500, Math.ceil((largest * 2) / 100) * 100);
    });

    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );

    // Id of the recipes-table row created when this meal was saved.
    // Null means this meal is not bookmarked yet.
    const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
    const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(
        null,
    );
    const [isSavingMeal, setIsSavingMeal] = useState(false);
    const [bookmarkError, setBookmarkError] = useState<string | null>(null);
    const [nutritionSheetIngredient, setNutritionSheetIngredient] = useState<
        number | null
    >(null);

    const [weightsEdited, setWeightsEdited] = useState(false);

    function updateWeight(index: number, weight: number) {
        setWeightsEdited(true);
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
        setWeightsEdited(true);
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

    const isBookmarked = optimisticSaved ?? savedRecipeId !== null;

    // Give immediate feedback, reverting to the stored state if the request fails.
    async function toggleBookmark() {
        if (isSavingMeal) return;

        setBookmarkError(null);
        setIsSavingMeal(true);
        setOptimisticSaved(savedRecipeId === null);

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
            setOptimisticSaved(null);
            setIsSavingMeal(false);
        }
    }

    const hasWeightChanges =
        originalMeal &&
        (weightsEdited ||
            meal.ingredients.some(
                (ingredient, index) =>
                    ingredient.weight !==
                    originalMeal.ingredients[index]?.weight,
            ));

    function resetWeights() {
        if (!originalMeal) return;
        setWeightsEdited(false);
        setWeightDrafts({});

        onChange({
            ...meal,
            ingredients: originalMeal.ingredients.map((ingredient) => ({
                ...ingredient,
            })),
        });
    }

    return (
        <section className="meal-result">
            <div className="meal-result-header">
                <div className="meal-result-title-block">
                    <p className="meal-result-eyebrow">Your recipe</p>
                    {onNameChange ? (
                        <input
                            className="meal-result-name-input"
                            aria-label="Meal name"
                            placeholder="Meal name"
                            required
                            value={meal.mealName}
                            onChange={(event) =>
                                onNameChange(event.target.value)
                            }
                        />
                    ) : (
                        <h2>{meal.mealName}</h2>
                    )}
                </div>

                {(showBookmark || showJournalButton) && (
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
                                    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4Z" />
                                </svg>
                            </button>
                        )}
                        {showJournalButton && (
                            <LogMealButton
                                meal={meal}
                                control={journalControl}
                            />
                        )}
                    </div>
                )}
            </div>

            {bookmarkError && (
                <p className="meal-bookmark-error" role="alert">
                    {bookmarkError}
                </p>
            )}
            <NutritionOverview
                nutrition={nutrition}
                percentages={macroPercentages}
            />

            <section className="meal-ingredients">
                <div className="meal-section-header">
                    <h3>Ingredients</h3>

                    {showWeightControls && hasWeightChanges && (
                        <button
                            type="button"
                            onClick={resetWeights}
                            className="meal-reset-button"
                            aria-label="Reset ingredient weights"
                            title="Reset ingredient weights"
                            disabled={!originalMeal}
                        >
                            <ResetIcon />
                        </button>
                    )}
                </div>

                <div className="ingredient-list">
                    {meal.ingredients.map((ingredient, index) => {
                        const calories =
                            (ingredient.caloriesPer100g * ingredient.weight) /
                            100;
                        const barWidth = Math.min(
                            100,
                            Math.max(
                                0,
                                (calories / ingredientCalorieScale) * 100,
                            ),
                        );
                        return (
                            <div
                                className="meal-ingredient"
                                key={`${ingredient.name}-${index}`}
                            >
                                <IngredientThumbnail
                                    name={ingredient.name}
                                    fdcId={ingredient.nutritionSource?.fdcId}
                                />
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
                                    <div className="ingredient-calorie-contribution">
                                        <span className="ingredient-calorie-value">
                                            {Math.round(calories)} kcal
                                        </span>
                                        <div
                                            className="ingredient-calorie-track"
                                            role="meter"
                                            aria-label={`${ingredient.name} calorie contribution`}
                                            aria-valuemin={0}
                                            aria-valuemax={
                                                ingredientCalorieScale
                                            }
                                            aria-valuenow={Math.min(
                                                ingredientCalorieScale,
                                                Math.max(0, calories),
                                            )}
                                            aria-valuetext={`${Math.round(calories)} kcal`}
                                        >
                                            <span
                                                className="ingredient-calorie-fill"
                                                style={{
                                                    width: `${barWidth}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {showWeightControls ? (
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
                                ) : (
                                    <span className="ingredient-weight-readonly">
                                        {Number(ingredient.weight.toFixed(1))} g
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            <MealMicronutrients ingredients={meal.ingredients} />

            <MealInstructions
                instructions={meal.instructions}
                ingredients={meal.ingredients}
                editor={instructionEditor}
            />

            {nutritionSheetIngredient !== null && (
                <IngredientNutritionSheet
                    ingredient={meal.ingredients[nutritionSheetIngredient]}
                    onClose={() => setNutritionSheetIngredient(null)}
                />
            )}
        </section>
    );
}
