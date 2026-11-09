import { totalNutrition } from '../../utils/nutrition';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
import SwipeableIngredientRow from './SwipeableIngredientRow';
import { deleteRecipe, saveRecipe } from '../../services/recipeService';

type MealResultProps = {
    meal: GenerateMealResponse;
    originalMeal?: GenerateMealResponse;
    onChange: (meal: GenerateMealResponse) => void;
    /* Hide the save action, e.g. on the recipe detail page
       where the meal is already saved. */
    showBookmark?: boolean;
    showSavedStar?: boolean;
    showWeightControls?: boolean;
    instructionEditor?: InstructionEditor;
    journalControl?: JournalControl;
    showJournalButton?: boolean;
    onNameChange?: (name: string) => void;
    ingredientComposer?: ReactNode;
    onRemoveIngredient?: (index: number) => void;
    onSavedRecipesChange?: () => void;
    creating?: boolean;
};

export default function MealResult({
    meal,
    originalMeal,
    onChange,
    showBookmark = true,
    showSavedStar = false,
    showWeightControls = true,
    instructionEditor,
    journalControl,
    showJournalButton = true,
    onNameChange,
    ingredientComposer,
    onRemoveIngredient,
    onSavedRecipesChange,
    creating = false,
}: MealResultProps) {
    const nutrition = useMemo(
        () => totalNutrition(meal.ingredients),
        [meal.ingredients],
    );
    const fiber = useMemo(() => {
        const included = meal.ingredients.filter(({ weight }) => weight > 0);
        const known = included.filter(
            ({ fiberPer100g }) =>
                typeof fiberPer100g === 'number' &&
                Number.isFinite(fiberPer100g) &&
                fiberPer100g >= 0,
        );
        return {
            grams: known.reduce(
                (sum, ingredient) =>
                    sum + (ingredient.fiberPer100g! * ingredient.weight) / 100,
                0,
            ),
            available: included.length > 0 && known.length === included.length,
            incomplete: known.length < included.length,
        };
    }, [meal.ingredients]);
    const [activeTab, setActiveTab] = useState<'nutrition' | 'steps'>(
        'nutrition',
    );
    const tabBaseId = useId();
    const nutritionTabRef = useRef<HTMLButtonElement>(null);
    const stepsTabRef = useRef<HTMLButtonElement>(null);
    const showAllSections = instructionEditor?.editing === true;

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
    const [openSwipeIndex, setOpenSwipeIndex] = useState<number | null>(null);

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

    function removeIngredientAt(index: number) {
        setOpenSwipeIndex(null);
        setWeightDrafts({});
        setWeightsEdited(true);
        if (onRemoveIngredient) onRemoveIngredient(index);
        else
            onChange({
                ...meal,
                ingredients: meal.ingredients.filter(
                    (_, itemIndex) => itemIndex !== index,
                ),
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
            onSavedRecipesChange?.();
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
            meal.ingredients.length !== originalMeal.ingredients.length ||
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

                {(showBookmark || showSavedStar || showJournalButton) && (
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
                                    <path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5Z" />
                                </svg>
                            </button>
                        )}
                        {showSavedStar && (
                            <span
                                className="meal-saved-star"
                                role="img"
                                aria-label="Saved to My Meals"
                                title="Saved to My Meals"
                            >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5Z" />
                                </svg>
                            </span>
                        )}
                        {showJournalButton && (
                            <LogMealButton
                                meal={meal}
                                control={journalControl}
                                destinationLabel="My Plan"
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
            <div
                className="meal-result-highlights"
                role="group"
                aria-label="Meal nutrition summary"
            >
                <div>
                    <strong>
                        {creating && !meal.ingredients.length
                            ? '—'
                            : `~${Math.round(nutrition.calories)} kcal`}
                    </strong>
                    <span>Calories</span>
                </div>
                <div>
                    <strong>
                        {creating && !meal.ingredients.length
                            ? '—'
                            : `~${Math.round(nutrition.protein)} g`}
                    </strong>
                    <span>Protein</span>
                </div>
                <div
                    title={
                        fiber.incomplete
                            ? 'Fiber data is unavailable for some ingredients'
                            : undefined
                    }
                >
                    <strong>
                        {fiber.available
                            ? `~${Math.round(fiber.grams)} g`
                            : '—'}
                    </strong>
                    <span>Fiber</span>
                </div>
            </div>

            {!showAllSections && (
                <div
                    className="meal-result-tabs"
                    role="tablist"
                    aria-label="Recipe details"
                    onKeyDown={(event) => {
                        const next =
                            event.key === 'ArrowRight'
                                ? activeTab === 'nutrition'
                                    ? 'steps'
                                    : 'nutrition'
                                : event.key === 'ArrowLeft'
                                  ? activeTab === 'steps'
                                      ? 'nutrition'
                                      : 'steps'
                                  : event.key === 'Home'
                                    ? 'nutrition'
                                    : event.key === 'End'
                                      ? 'steps'
                                      : null;
                        if (!next) return;
                        event.preventDefault();
                        setActiveTab(next);
                        (next === 'nutrition'
                            ? nutritionTabRef
                            : stepsTabRef
                        ).current?.focus();
                    }}
                >
                    <button
                        ref={nutritionTabRef}
                        type="button"
                        role="tab"
                        id={`${tabBaseId}-nutrition-tab`}
                        aria-controls={`${tabBaseId}-nutrition-panel`}
                        aria-selected={activeTab === 'nutrition'}
                        tabIndex={activeTab === 'nutrition' ? 0 : -1}
                        onClick={() => setActiveTab('nutrition')}
                    >
                        Ingredients &amp; Nutrition
                    </button>
                    <button
                        ref={stepsTabRef}
                        type="button"
                        role="tab"
                        id={`${tabBaseId}-steps-tab`}
                        aria-controls={`${tabBaseId}-steps-panel`}
                        aria-selected={activeTab === 'steps'}
                        tabIndex={activeTab === 'steps' ? 0 : -1}
                        onClick={() => setActiveTab('steps')}
                    >
                        Steps
                    </button>
                </div>
            )}

            <div
                className="meal-result-panel"
                id={`${tabBaseId}-nutrition-panel`}
                role={showAllSections ? undefined : 'tabpanel'}
                tabIndex={showAllSections ? undefined : 0}
                aria-labelledby={
                    showAllSections ? undefined : `${tabBaseId}-nutrition-tab`
                }
                hidden={!showAllSections && activeTab !== 'nutrition'}
            >
                <section className="meal-ingredients">
                    <div className="meal-section-header">
                        <h3>Ingredients</h3>

                        {showWeightControls && hasWeightChanges && (
                            <button
                                type="button"
                                onClick={resetWeights}
                                className="meal-reset-button"
                                aria-label={
                                    meal.ingredients.length !==
                                    originalMeal.ingredients.length
                                        ? 'Reset ingredients'
                                        : 'Reset ingredient weights'
                                }
                                title={
                                    meal.ingredients.length !==
                                    originalMeal.ingredients.length
                                        ? 'Reset ingredients'
                                        : 'Reset ingredient weights'
                                }
                                disabled={!originalMeal}
                            >
                                <ResetIcon />
                            </button>
                        )}
                    </div>

                    <div className="ingredient-list">
                        {meal.ingredients.map((ingredient, index) => {
                            const calories =
                                (ingredient.caloriesPer100g *
                                    ingredient.weight) /
                                100;
                            const barWidth = Math.min(
                                100,
                                Math.max(
                                    0,
                                    (calories / ingredientCalorieScale) * 100,
                                ),
                            );
                            return (
                                <SwipeableIngredientRow
                                    key={`${ingredient.name}-${index}-${showWeightControls}`}
                                    name={ingredient.name}
                                    enabled={
                                        showWeightControls ||
                                        Boolean(onRemoveIngredient)
                                    }
                                    open={openSwipeIndex === index}
                                    onOpen={() => setOpenSwipeIndex(index)}
                                    onClose={() => setOpenSwipeIndex(null)}
                                    onRemove={() => removeIngredientAt(index)}
                                >
                                    <div className="meal-ingredient">
                                        <IngredientThumbnail
                                            name={ingredient.name}
                                            fdcId={
                                                ingredient.nutritionSource
                                                    ?.fdcId
                                            }
                                            source={ingredient.thumbnailSource}
                                        />
                                        <div className="ingredient-info">
                                            <div className="ingredient-info-heading">
                                                <button
                                                    type="button"
                                                    className="ingredient-name ingredient-name-button"
                                                    onClick={() =>
                                                        setNutritionSheetIngredient(
                                                            index,
                                                        )
                                                    }
                                                >
                                                    {ingredient.resolvedName ??
                                                        ingredient.name}

                                                    <span
                                                        className="ingredient-name-chevron"
                                                        aria-hidden="true"
                                                    />
                                                </button>
                                                {onRemoveIngredient && (
                                                    <button
                                                        type="button"
                                                        className="meal-ingredient-remove"
                                                        aria-label={`Remove ${ingredient.name}`}
                                                        title={`Remove ${ingredient.name}`}
                                                        onClick={() =>
                                                            removeIngredientAt(
                                                                index,
                                                            )
                                                        }
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                            <div className="ingredient-calorie-contribution">
                                                <div
                                                    className="ingredient-calorie-track"
                                                    role="meter"
                                                    aria-label={`${ingredient.resolvedName ?? ingredient.name} calorie contribution`}
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

                                        <div className="ingredient-portion-summary">
                                            {showWeightControls ? (
                                                <div className="ingredient-weight-control">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            adjustWeight(
                                                                index,
                                                                -5,
                                                            )
                                                        }
                                                        aria-label={`Decrease ${ingredient.name} by 5 grams`}
                                                    >
                                                        −
                                                    </button>
                                                    <IngredientWeightInput
                                                        value={
                                                            weightDrafts[
                                                                index
                                                            ] ??
                                                            String(
                                                                ingredient.weight,
                                                            )
                                                        }
                                                        name={ingredient.name}
                                                        onChange={(text) =>
                                                            handleWeightInputChange(
                                                                index,
                                                                text,
                                                            )
                                                        }
                                                        onBlur={() =>
                                                            handleWeightInputBlur(
                                                                index,
                                                            )
                                                        }
                                                    />

                                                    <span>g</span>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            adjustWeight(
                                                                index,
                                                                5,
                                                            )
                                                        }
                                                        aria-label={`Increase ${ingredient.name} by 5 grams`}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="ingredient-weight-readonly">
                                                    {Number(
                                                        ingredient.weight.toFixed(
                                                            1,
                                                        ),
                                                    )}{' '}
                                                    g
                                                </span>
                                            )}
                                            <span className="ingredient-calorie-value">
                                                {Math.round(calories)} kcal
                                            </span>
                                        </div>
                                    </div>
                                </SwipeableIngredientRow>
                            );
                        })}
                    </div>
                    {ingredientComposer}
                </section>

                {(!creating || meal.ingredients.length > 0) && (
                    <div className="meal-nutrition-section">
                        <div className="meal-section-header">
                            <h3>Nutrition</h3>
                        </div>
                        <NutritionOverview
                            nutrition={nutrition}
                            percentages={macroPercentages}
                        />
                        <MealMicronutrients ingredients={meal.ingredients} />
                    </div>
                )}
            </div>

            <div
                className="meal-result-panel"
                id={`${tabBaseId}-steps-panel`}
                role={showAllSections ? undefined : 'tabpanel'}
                tabIndex={showAllSections ? undefined : 0}
                aria-labelledby={
                    showAllSections ? undefined : `${tabBaseId}-steps-tab`
                }
                hidden={!showAllSections && activeTab !== 'steps'}
            >
                <MealInstructions
                    instructions={meal.instructions}
                    editor={instructionEditor}
                />
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
