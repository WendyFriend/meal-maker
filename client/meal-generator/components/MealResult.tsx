import {
    hasUnavailableNutrition,
    knownNutritionIngredients,
    totalFiber,
    totalNutrition,
} from '../../utils/nutrition';
import {
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import './MealResult.css';
import LogMealButton, {
    type JournalControl,
} from '../../journal/LogMealButton';
import ActionFeedback from '../../components/ActionFeedback';
import ResetIcon from '../../components/ResetIcon';
import type {
    GenerateMealResponse,
    IngredientInfo,
} from '../../../shared/types/types';
import NutritionOverview from './NutritionOverview';
import MealMicronutrients from './MealMicronutrients';
import MealInstructions, { type InstructionEditor } from './MealInstructions';
import SwipeableIngredientRow from './SwipeableIngredientRow';
import IngredientSectionRow from '../../components/IngredientSectionRow';
import EditIcon from '../../components/EditIcon';
import IngredientSection from '../../components/IngredientSection';
import type { IngredientSectionFeedback } from '../../hooks/useIngredientSectionSave';
import type { RecipeNutritionEnrichment } from '../../utils/recipeNutrition';
import useMealBookmark from '../../hooks/useMealBookmark';

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
    reserveHeaderActionSpace?: boolean;
    onNameChange?: (name: string) => void;
    onNameEdit?: () => void;
    onIngredientsEdit?: () => void;
    onStepsEdit?: () => void;
    nameActions?: ReactNode;
    ingredientActions?: ReactNode;
    ingredientEditing?: boolean;
    ingredientFeedback?: IngredientSectionFeedback;
    stepsActions?: ReactNode;
    ingredientComposer?: ReactNode;
    onRemoveIngredient?: (index: number) => void;
    showIngredientChevron?: boolean;
    nutritionLookingUpIndices?: ReadonlySet<number>;
    onIngredientNutritionResolved?: (
        index: number,
        ingredient: IngredientInfo,
    ) => void;
    onNutritionFound?: (enrichments: RecipeNutritionEnrichment[]) => void;
    onSavedRecipesChange?: () => void;
    onAuthRequired?: (action: 'save-meal' | 'my-day') => boolean;
    creating?: boolean;
    showPartialNutrition?: boolean;
};

const detailTabs = ['ingredients', 'nutrients', 'steps'] as const;
type DetailTab = (typeof detailTabs)[number];

export default function MealResult({
    meal,
    originalMeal,
    onChange,
    showBookmark = true,
    showWeightControls = true,
    instructionEditor,
    journalControl,
    showJournalButton = true,
    reserveHeaderActionSpace = false,
    onNameChange,
    onNameEdit,
    onIngredientsEdit,
    onStepsEdit,
    nameActions,
    ingredientActions,
    ingredientEditing = false,
    ingredientFeedback,
    stepsActions,
    ingredientComposer,
    onRemoveIngredient,
    showIngredientChevron = true,
    nutritionLookingUpIndices,
    onIngredientNutritionResolved,
    onNutritionFound,
    onSavedRecipesChange,
    onAuthRequired,
    creating = false,
    showPartialNutrition = false,
}: MealResultProps) {
    const nutritionIngredients = useMemo(
        () =>
            showPartialNutrition
                ? knownNutritionIngredients(meal.ingredients)
                : meal.ingredients,
        [meal.ingredients, showPartialNutrition],
    );
    const nutrition = useMemo(
        () => totalNutrition(nutritionIngredients),
        [nutritionIngredients],
    );
    const fiber = useMemo(
        () => totalFiber(meal.ingredients),
        [meal.ingredients],
    );
    const incompleteNutrition = hasUnavailableNutrition(meal.ingredients);
    const partialNutrition =
        showPartialNutrition &&
        incompleteNutrition &&
        nutritionIngredients.length > 0;
    const [activeTab, setActiveTab] = useState<DetailTab>('ingredients');
    const tabBaseId = useId();
    const ingredientsTabRef = useRef<HTMLButtonElement>(null);
    const nutrientsTabRef = useRef<HTMLButtonElement>(null);
    const stepsTabRef = useRef<HTMLButtonElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const showAllSections =
        instructionEditor?.editing === true && !stepsActions;
    const editingName = Boolean(onNameChange);

    useLayoutEffect(() => {
        if (editingName) nameInputRef.current?.focus({ preventScroll: true });
    }, [editingName]);

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
            ...(originalMeal ?? meal).ingredients.map((ingredient) =>
                ingredient.nutritionUnavailable
                    ? 0
                    : (ingredient.caloriesPer100g * ingredient.weight) / 100,
            ),
        );
        return Math.max(500, Math.ceil((largest * 2) / 100) * 100);
    });

    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );

    const {
        isBookmarked,
        isSavingMeal,
        bookmarkError,
        bookmarkFeedback,
        closeBookmarkFeedback,
        toggleBookmark,
    } = useMealBookmark(meal, onSavedRecipesChange, () =>
        onAuthRequired?.('save-meal'),
    );
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
                            ref={nameInputRef}
                            className="meal-result-name-input"
                            aria-label="Meal name"
                            placeholder="Meal name"
                            required
                            value={meal.mealName}
                            onChange={(event) =>
                                onNameChange(event.target.value)
                            }
                        />
                    ) : onNameEdit ? (
                        <h2>
                            <button
                                type="button"
                                className="meal-result-name-edit-trigger"
                                aria-label={`Edit recipe name, ${meal.mealName}`}
                                onClick={onNameEdit}
                            >
                                {meal.mealName}
                            </button>
                        </h2>
                    ) : reserveHeaderActionSpace ? (
                        <h2>
                            <span className="meal-result-name-edit-trigger meal-result-name-display">
                                {meal.mealName}
                            </span>
                        </h2>
                    ) : (
                        <h2>{meal.mealName}</h2>
                    )}
                    {nameActions}
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
                                    <path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5Z" />
                                </svg>
                            </button>
                        )}
                        {showJournalButton && (
                            <LogMealButton
                                meal={meal}
                                control={journalControl}
                                destinationLabel="My Plan"
                                onAuthRequired={() =>
                                    onAuthRequired?.('my-day') ?? false
                                }
                            />
                        )}
                    </div>
                )}
                {!showBookmark &&
                    !showJournalButton &&
                    reserveHeaderActionSpace && (
                        <div
                            className="meal-result-actions meal-result-actions-placeholder"
                            aria-hidden="true"
                        />
                    )}
            </div>

            {bookmarkError && (
                <p className="meal-bookmark-error" role="alert">
                    {bookmarkError}
                </p>
            )}
            {bookmarkFeedback && (
                <ActionFeedback
                    message="Saved to My Recipes"
                    onClose={closeBookmarkFeedback}
                />
            )}
            <NutritionOverview
                ariaLabel="Meal nutrition summary"
                className="meal-result-summary-overview"
                nutrition={nutrition}
                fiber={{
                    ...fiber,
                    hasKnown: showPartialNutrition && fiber.hasKnown,
                }}
                percentages={macroPercentages}
                incomplete={
                    incompleteNutrition ||
                    (creating && !meal.ingredients.length)
                }
                partial={partialNutrition}
            />

            {!showAllSections && (
                <div
                    className="meal-result-tabs"
                    role="tablist"
                    aria-label="Recipe details"
                    onKeyDown={(event) => {
                        const currentIndex = detailTabs.indexOf(activeTab);
                        const direction =
                            event.key === 'ArrowRight'
                                ? 1
                                : event.key === 'ArrowLeft'
                                  ? -1
                                  : 0;
                        const next = direction
                            ? detailTabs[
                                  (currentIndex +
                                      direction +
                                      detailTabs.length) %
                                      detailTabs.length
                              ]
                            : event.key === 'Home'
                              ? detailTabs[0]
                              : event.key === 'End'
                                ? detailTabs[detailTabs.length - 1]
                                : null;
                        if (!next) return;
                        event.preventDefault();
                        setActiveTab(next);
                        const tabRefs = {
                            ingredients: ingredientsTabRef,
                            nutrients: nutrientsTabRef,
                            steps: stepsTabRef,
                        };
                        tabRefs[next].current?.focus();
                    }}
                >
                    <button
                        ref={ingredientsTabRef}
                        type="button"
                        role="tab"
                        id={`${tabBaseId}-ingredients-tab`}
                        aria-controls={`${tabBaseId}-ingredients-panel`}
                        aria-selected={activeTab === 'ingredients'}
                        tabIndex={activeTab === 'ingredients' ? 0 : -1}
                        onClick={() => setActiveTab('ingredients')}
                    >
                        Ingredients
                    </button>
                    <button
                        ref={nutrientsTabRef}
                        type="button"
                        role="tab"
                        id={`${tabBaseId}-nutrients-tab`}
                        aria-controls={`${tabBaseId}-nutrients-panel`}
                        aria-selected={activeTab === 'nutrients'}
                        tabIndex={activeTab === 'nutrients' ? 0 : -1}
                        onClick={() => setActiveTab('nutrients')}
                    >
                        Key Nutrients
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
                id={`${tabBaseId}-ingredients-panel`}
                role={showAllSections ? undefined : 'tabpanel'}
                tabIndex={showAllSections ? undefined : 0}
                aria-labelledby={
                    showAllSections ? undefined : `${tabBaseId}-ingredients-tab`
                }
                hidden={!showAllSections && activeTab !== 'ingredients'}
            >
                <IngredientSection
                    className="meal-ingredients"
                    headerClassName="meal-section-header"
                    editing={ingredientEditing}
                    feedback={ingredientFeedback}
                    actions={
                        <>
                            {ingredientActions ??
                                (onIngredientsEdit && (
                                    <button
                                        type="button"
                                        className="edit-icon-button meal-section-edit-button"
                                        aria-label="Edit ingredients"
                                        title="Edit ingredients"
                                        onClick={onIngredientsEdit}
                                    >
                                        <EditIcon />
                                    </button>
                                ))}

                            {showWeightControls &&
                                hasWeightChanges &&
                                !ingredientActions && (
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
                        </>
                    }
                >
                    <div className="ingredient-list">
                        {meal.ingredients.map((ingredient, index) => (
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
                                menuDelete={Boolean(onRemoveIngredient)}
                            >
                                <IngredientSectionRow
                                    ingredient={ingredient}
                                    calorieScale={ingredientCalorieScale}
                                    showChevron={showIngredientChevron}
                                    nutritionLookingUp={nutritionLookingUpIndices?.has(
                                        index,
                                    )}
                                    onNutritionResolved={
                                        onIngredientNutritionResolved
                                            ? (resolved) =>
                                                  onIngredientNutritionResolved(
                                                      index,
                                                      resolved,
                                                  )
                                            : undefined
                                    }
                                    weightControls={
                                        showWeightControls
                                            ? {
                                                  value:
                                                      weightDrafts[index] ??
                                                      String(ingredient.weight),
                                                  onChange: (text) =>
                                                      handleWeightInputChange(
                                                          index,
                                                          text,
                                                      ),
                                                  onBlur: () =>
                                                      handleWeightInputBlur(
                                                          index,
                                                      ),
                                                  onDecrease: () =>
                                                      adjustWeight(index, -5),
                                                  onIncrease: () =>
                                                      adjustWeight(index, 5),
                                              }
                                            : undefined
                                    }
                                />
                            </SwipeableIngredientRow>
                        ))}
                    </div>
                    {ingredientComposer}
                </IngredientSection>
            </div>

            <div
                className="meal-result-panel"
                id={`${tabBaseId}-nutrients-panel`}
                role={showAllSections ? undefined : 'tabpanel'}
                tabIndex={showAllSections ? undefined : 0}
                aria-labelledby={
                    showAllSections ? undefined : `${tabBaseId}-nutrients-tab`
                }
                hidden={!showAllSections && activeTab !== 'nutrients'}
            >
                {(!creating || meal.ingredients.length > 0) && (
                    <div className="meal-nutrition-section">
                        <MealMicronutrients
                            ingredients={meal.ingredients}
                            onNutritionFound={onNutritionFound}
                        />
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
                    headerAction={
                        stepsActions ??
                        (onStepsEdit && (
                            <button
                                type="button"
                                className="edit-icon-button meal-section-edit-button"
                                aria-label="Edit steps"
                                title="Edit steps"
                                onClick={onStepsEdit}
                            >
                                <EditIcon />
                            </button>
                        ))
                    }
                />
            </div>
        </section>
    );
}
