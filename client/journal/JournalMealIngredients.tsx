import { useRef, useState } from 'react';
import type { JournalEntry } from '../../shared/types/journal';
import type {
    IngredientInfo,
    MealIngredient,
    UserIngredient,
} from '../../shared/types/types';
import CloseIcon from '../components/CloseIcon';
import IngredientSection, {
    IngredientSectionActions,
} from '../components/IngredientSection';
import { useIngredientSectionSave } from '../hooks/useIngredientSectionSave';
import { RecipeIngredientNameInput } from '../CreateRecipe';
import IngredientThumbnail from '../meal-generator/components/IngredientThumbnail';
import IngredientSectionRow from '../components/IngredientSectionRow';
import NutritionOverview from '../meal-generator/components/NutritionOverview';
import SwipeableIngredientRow from '../meal-generator/components/SwipeableIngredientRow';
import { findCommonQuickAddIngredient } from '../meal-generator/components/commonQuickAddIngredients';
import { normalizeIngredientName } from '../utils/Ingredient';
import {
    hasUnavailableNutrition,
    knownNutritionIngredients,
    totalFiber,
    totalNutrition,
} from '../utils/nutrition';
import '../meal-generator/components/MealResult.css';

function macroPercentages(ingredients: MealIngredient[]) {
    const totals = totalNutrition(ingredients);
    const carbohydrate = totals.carbohydrate * 4;
    const protein = totals.protein * 4;
    const fat = totals.fat * 9;
    const total = carbohydrate + protein + fat;
    return {
        carbohydrate: total > 0 ? (carbohydrate / total) * 100 : 0,
        protein: total > 0 ? (protein / total) * 100 : 0,
        fat: total > 0 ? (fat / total) * 100 : 0,
    };
}

function newIngredient(source: IngredientInfo): MealIngredient {
    const missingNutrition = [
        source.caloriesPer100g,
        source.proteinPer100g,
        source.carbohydratePer100g,
        source.fatPer100g,
    ].some((value) => !Number.isFinite(value));
    return {
        ...source,
        weight: 100,
        caloriesPer100g: source.caloriesPer100g ?? 0,
        proteinPer100g: source.proteinPer100g ?? 0,
        carbohydratePer100g: source.carbohydratePer100g ?? 0,
        fatPer100g: source.fatPer100g ?? 0,
        ...(missingNutrition ? { nutritionUnavailable: true as const } : {}),
    };
}

export default function JournalMealIngredients({
    entry,
    disabled,
    savedIngredients,
    onSave,
}: {
    entry: JournalEntry;
    disabled: boolean;
    savedIngredients: UserIngredient[];
    onSave: (ingredients: MealIngredient[]) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<MealIngredient[]>([]);
    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );
    const [adding, setAdding] = useState(false);
    const [ingredientName, setIngredientName] = useState('');
    const [openSwipeIndex, setOpenSwipeIndex] = useState<number | null>(null);
    const feedback = useIngredientSectionSave();
    const { saving } = feedback;
    const [error, setError] = useState('');
    const cancelAddIntent = useRef(false);
    const ingredients = editing || saving ? draft : entry.ingredients;
    const knownIngredients = knownNutritionIngredients(ingredients);
    const totals = totalNutrition(knownIngredients);
    const incompleteNutrition = hasUnavailableNutrition(ingredients);
    const largestIngredientCalories = Math.max(
        0,
        ...entry.ingredients.map((ingredient) =>
            ingredient.nutritionUnavailable
                ? 0
                : (ingredient.caloriesPer100g * ingredient.weight) / 100,
        ),
    );
    const ingredientCalorieScale = Math.max(
        500,
        Math.ceil((largestIngredientCalories * 2) / 100) * 100,
    );

    function startEditing() {
        setDraft(entry.ingredients.map((ingredient) => ({ ...ingredient })));
        setWeightDrafts({});
        setAdding(false);
        setIngredientName('');
        setOpenSwipeIndex(null);
        setError('');
        setEditing(true);
    }

    function finishEditing() {
        if (saving) return;
        setEditing(false);
        setAdding(false);
        setIngredientName('');
        setWeightDrafts({});
        setOpenSwipeIndex(null);
        setError('');
    }

    function commitIngredient(name: string, selected?: IngredientInfo) {
        const trimmed = name.trim();
        if (!trimmed || cancelAddIntent.current) return;
        const source = selected ??
            savedIngredients.find(
                (ingredient) =>
                    normalizeIngredientName(ingredient.name) ===
                    normalizeIngredientName(trimmed),
            ) ??
            findCommonQuickAddIngredient(trimmed) ?? { name: trimmed };
        setDraft((current) => [...current, newIngredient(source)]);
        setIngredientName('');
        setAdding(false);
        setError('');
    }

    async function saveIngredients() {
        if (saving) return;
        const next =
            adding && ingredientName.trim()
                ? [
                      ...draft,
                      newIngredient(
                          savedIngredients.find(
                              (ingredient) =>
                                  normalizeIngredientName(ingredient.name) ===
                                  normalizeIngredientName(ingredientName),
                          ) ??
                              findCommonQuickAddIngredient(ingredientName) ?? {
                                  name: ingredientName.trim(),
                              },
                      ),
                  ]
                : draft;
        if (!next.length) {
            setError('Add at least one ingredient.');
            return;
        }
        if (JSON.stringify(next) === JSON.stringify(entry.ingredients)) {
            finishEditing();
            return;
        }
        setDraft(next);
        setEditing(false);
        setError('');
        try {
            await feedback.save(() => onSave(next));
            setAdding(false);
            setIngredientName('');
            setWeightDrafts({});
            setOpenSwipeIndex(null);
        } catch {
            setEditing(true);
            setError(
                'Could not save ingredients. Your changes are still here.',
            );
        }
    }

    function changeWeight(index: number, value: string) {
        setWeightDrafts((current) => ({ ...current, [index]: value }));
        if (
            value !== '' &&
            (!Number.isFinite(Number(value)) || Number(value) < 0)
        )
            return;
        setDraft((current) =>
            current.map((ingredient, itemIndex) =>
                itemIndex === index
                    ? {
                          ...ingredient,
                          weight: value === '' ? 0 : Number(value),
                      }
                    : ingredient,
            ),
        );
    }

    return (
        <div className="journal-meal-content" aria-busy={saving}>
            <NutritionOverview
                ariaLabel="Meal nutrition overview"
                className="journal-meal-nutrition-overview"
                nutrition={totals}
                fiber={totalFiber(ingredients)}
                incomplete={incompleteNutrition}
                partial={incompleteNutrition && knownIngredients.length > 0}
                percentages={macroPercentages(knownIngredients)}
            />
            <IngredientSection
                className="journal-meal-ingredients-section"
                headerClassName="journal-meal-ingredients-heading"
                editing={editing}
                feedback={feedback}
                error={error}
                actions={
                    <IngredientSectionActions
                        editing={editing}
                        saving={saving}
                        disabled={disabled}
                        editLabel={`Edit ingredients in ${entry.mealName}`}
                        onEdit={startEditing}
                        onCancel={finishEditing}
                        onSave={() => void saveIngredients()}
                    />
                }
            >
                <ul
                    className={`journal-meal-ingredients${editing ? ' journal-meal-ingredients-editing' : ''}`}
                >
                    {ingredients.map((ingredient, index) => (
                        <li
                            key={`${ingredient.name}-${index}`}
                            className={
                                editing
                                    ? undefined
                                    : 'journal-ingredient-read-item'
                            }
                        >
                            {editing ? (
                                <SwipeableIngredientRow
                                    name={ingredient.name}
                                    enabled={!saving}
                                    open={openSwipeIndex === index}
                                    onOpen={() => setOpenSwipeIndex(index)}
                                    onClose={() => setOpenSwipeIndex(null)}
                                    onRemove={() => {
                                        setDraft((current) =>
                                            current.filter(
                                                (_, itemIndex) =>
                                                    itemIndex !== index,
                                            ),
                                        );
                                        setWeightDrafts({});
                                        setOpenSwipeIndex(null);
                                    }}
                                    menuDelete
                                >
                                    <IngredientSectionRow
                                        ingredient={ingredient}
                                        calorieScale={ingredientCalorieScale}
                                        className="journal-ingredient-edit-row"
                                        showChevron={false}
                                        weightControls={{
                                            value:
                                                weightDrafts[index] ??
                                                String(ingredient.weight),
                                            onChange: (value) =>
                                                changeWeight(index, value),
                                            onBlur: () => {
                                                setWeightDrafts((current) => {
                                                    const next = { ...current };
                                                    delete next[index];
                                                    return next;
                                                });
                                            },
                                            onDecrease: () =>
                                                changeWeight(
                                                    index,
                                                    String(
                                                        Math.max(
                                                            0,
                                                            ingredient.weight -
                                                                5,
                                                        ),
                                                    ),
                                                ),
                                            onIncrease: () =>
                                                changeWeight(
                                                    index,
                                                    String(
                                                        ingredient.weight + 5,
                                                    ),
                                                ),
                                        }}
                                    />
                                </SwipeableIngredientRow>
                            ) : (
                                <IngredientSectionRow
                                    ingredient={ingredient}
                                    calorieScale={ingredientCalorieScale}
                                    className="journal-ingredient-read-row"
                                    showChevron
                                />
                            )}
                        </li>
                    ))}
                </ul>
                {editing && (
                    <>
                        {adding && (
                            <div className="journal-ingredient-composer">
                                <IngredientThumbnail
                                    name={ingredientName || 'Ingredient'}
                                />
                                <RecipeIngredientNameInput
                                    value={ingredientName}
                                    index={ingredients.length}
                                    focusInput={(node) => {
                                        if (node && !ingredientName)
                                            node.focus({ preventScroll: true });
                                    }}
                                    savedIngredients={savedIngredients}
                                    onChange={setIngredientName}
                                    onCommit={commitIngredient}
                                    onOpenSheet={() => {}}
                                />
                                <button
                                    type="button"
                                    aria-label="Cancel adding ingredient"
                                    onPointerDown={() => {
                                        cancelAddIntent.current = true;
                                    }}
                                    onPointerUp={() => {
                                        cancelAddIntent.current = false;
                                    }}
                                    onPointerCancel={() => {
                                        cancelAddIntent.current = false;
                                    }}
                                    onClick={() => {
                                        setAdding(false);
                                        setIngredientName('');
                                    }}
                                >
                                    <CloseIcon />
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            className="journal-ingredient-add"
                            aria-label="Add ingredient"
                            disabled={saving}
                            onClick={() => setAdding(true)}
                        >
                            + Add ingredient
                        </button>
                    </>
                )}
            </IngredientSection>
        </div>
    );
}
