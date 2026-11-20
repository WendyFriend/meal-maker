import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Recipe } from '../shared/types/recipe';
import type {
    GenerateMealResponse,
    IngredientInfo,
    MealIngredient,
    UserIngredient,
} from '../shared/types/types';
import CloseIcon from './components/CloseIcon';
import { CancelButton, ConfirmButton } from './components/ConfirmCancelButtons';
import { IngredientSectionActions } from './components/IngredientSection';
import { useIngredientSectionSave } from './hooks/useIngredientSectionSave';
import { useUndoToast } from './hooks/useUndoToast';
import { RecipeIngredientNameInput } from './CreateRecipe';
import MealResult from './meal-generator/components/MealResult';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import IngredientCalorieContribution from './meal-generator/components/IngredientCalorieContribution';
import { findCommonQuickAddIngredient } from './meal-generator/components/commonQuickAddIngredients';
import { normalizeIngredientName } from './utils/Ingredient';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
} from './services/micronutrientService';
import { fillRecipeNutrition } from './services/recipeService';
import {
    fillMissingRecipeNutrition,
    type RecipeNutritionEnrichment,
} from './utils/recipeNutrition';
import { calorieScale } from './utils/nutrition';
import './RecipeDetail.css';
import AddRowButton from './components/AddRowButton';

type EditSection = 'name' | 'ingredients' | 'steps';
const EMPTY_SAVED_INGREDIENTS: UserIngredient[] = [];

function toMeal(recipe: Recipe): GenerateMealResponse {
    return {
        mealName: recipe.recipeName,
        ingredients: recipe.ingredients.map((ingredient) => ({
            ...ingredient,
        })),
        instructions: [...recipe.instructions],
    };
}

function sameIngredients(
    first: GenerateMealResponse['ingredients'],
    second: GenerateMealResponse['ingredients'],
) {
    const sortedKeys = (_key: string, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(
                  Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
              )
            : value;
    return (
        JSON.stringify(first, sortedKeys) === JSON.stringify(second, sortedKeys)
    );
}

function completeIngredient(
    source: IngredientInfo,
): source is IngredientInfo &
    Required<
        Pick<
            IngredientInfo,
            | 'caloriesPer100g'
            | 'proteinPer100g'
            | 'carbohydratePer100g'
            | 'fatPer100g'
        >
    > {
    return (
        Number.isFinite(source.caloriesPer100g) &&
        Number.isFinite(source.proteinPer100g) &&
        Number.isFinite(source.carbohydratePer100g) &&
        Number.isFinite(source.fatPer100g)
    );
}

function toMealIngredient(source: IngredientInfo): MealIngredient {
    return completeIngredient(source)
        ? { ...source, weight: 100 }
        : {
              ...source,
              weight: 100,
              caloriesPer100g: source.caloriesPer100g ?? 0,
              proteinPer100g: source.proteinPer100g ?? 0,
              carbohydratePer100g: source.carbohydratePer100g ?? 0,
              fatPer100g: source.fatPer100g ?? 0,
              nutritionUnavailable: true,
          };
}

function withResolvedNutrition(
    ingredient: MealIngredient,
    nutrition: IngredientInfo,
): MealIngredient {
    if (!completeIngredient(nutrition)) return ingredient;
    const resolved: MealIngredient = {
        ...ingredient,
        ...nutrition,
        name: ingredient.name,
        weight: ingredient.weight,
    };
    delete resolved.nutritionUnavailable;
    return resolved;
}

function matchingMealIngredient(
    name: string,
    ingredients: MealIngredient[],
): MealIngredient | undefined {
    const normalized = normalizeIngredientName(name);
    if (!normalized) return undefined;
    return ingredients.find(
        (ingredient) =>
            !ingredient.nutritionUnavailable &&
            [ingredient.name, ingredient.resolvedName].some(
                (candidate) =>
                    candidate &&
                    normalizeIngredientName(candidate) === normalized,
            ),
    );
}

function findIngredientSource(
    name: string,
    ingredients: MealIngredient[],
    savedIngredientsByName: ReadonlyMap<string, UserIngredient>,
): IngredientInfo | undefined {
    const known =
        matchingMealIngredient(name, ingredients) ??
        savedIngredientsByName.get(normalizeIngredientName(name)) ??
        findCommonQuickAddIngredient(name);
    if (known) return known;
    const cached = getCachedIngredientNutrition(name);
    return cached
        ? {
              ...cached,
              name,
              resolvedName: cached.resolvedName ?? cached.name,
          }
        : undefined;
}

function recipeInput(meal: GenerateMealResponse) {
    return {
        recipeName: meal.mealName.trim(),
        ingredients: meal.ingredients,
        instructions: meal.instructions
            .map((step) => step.trim())
            .filter(Boolean),
    };
}

function sectionIsUnchanged(
    section: EditSection,
    input: ReturnType<typeof recipeInput>,
    original: GenerateMealResponse,
) {
    if (section === 'name') return input.recipeName === original.mealName;
    if (section === 'ingredients')
        return sameIngredients(input.ingredients, original.ingredients);
    return (
        JSON.stringify(input.instructions) ===
        JSON.stringify(original.instructions)
    );
}

function SectionActions({
    section,
    saving,
    onSave,
    onCancel,
}: {
    section: EditSection;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
}) {
    return (
        <div className="recipe-detail-edit-actions">
            <CancelButton
                label={`Cancel ${section} changes`}
                title="Cancel changes"
                disabled={saving}
                onClick={onCancel}
            />
            <ConfirmButton
                className="recipe-detail-save-section"
                label={
                    saving
                        ? `Saving ${section} changes`
                        : `Save ${section} changes`
                }
                title={saving ? 'Saving changes' : 'Save changes'}
                busy={saving}
                disabled={saving}
                onClick={onSave}
            />
        </div>
    );
}

const NAME_FORM_ID = 'recipe-name-form';

/** Name editing state for the app header's ✕ / ✓. */
export type RecipeNameEditor = { formId: string; saving: boolean };

export default function RecipeDetail({
    recipe,
    savedIngredients = EMPTY_SAVED_INGREDIENTS,
    onSave,
    startInEditMode = false,
    variant = 'recipe',
    onSavedRecipesChange,
    onNameEditingChange,
}: {
    recipe: Recipe;
    savedIngredients?: UserIngredient[];
    onSave?: (recipe: Recipe) => Promise<Recipe>;
    startInEditMode?: boolean;
    /**
     * 'plan-meal' shows a My Diary meal as a recipe: its ingredients can be
     * edited (saved back to the plan through onSave) and it can be starred
     * into My Recipes, since it may not be saved there yet. Its name and
     * ingredients save back to the plan; plan meals have no steps.
     */
    variant?: 'recipe' | 'plan-meal';
    onSavedRecipesChange?: () => void;
    /**
     * Name edits are confirmed from the app header (✕ / ✓), so the field
     * keeps the heading's full width and the page never reflows.
     */
    onNameEditingChange?: (editor: RecipeNameEditor | null) => void;
}) {
    const planMeal = variant === 'plan-meal';
    const [originalMeal, setOriginalMeal] = useState(() => toMeal(recipe));
    const [meal, setMeal] = useState(originalMeal);
    const [section, setSection] = useState<EditSection | null>(
        startInEditMode ? 'ingredients' : null,
    );
    const [addingIngredient, setAddingIngredient] = useState(false);
    const [ingredientName, setIngredientName] = useState('');
    const [nutritionLookingUpIndices, setNutritionLookingUpIndices] = useState<
        Set<number>
    >(() => new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [journalEntryId, setJournalEntryId] = useState<string | null>(null);
    const [resetVersion, setResetVersion] = useState(0);
    const ingredientFeedback = useIngredientSectionSave();
    // Removing an ingredient only edits the draft, so Undo puts it back.
    const removalUndo = useUndoToast();
    const pending = useRef(false);
    const mealRef = useRef(meal);
    const addingRef = useRef(false);
    const cancelAddIntent = useRef(false);
    const ingredientEditVersion = useRef(0);
    const nextIngredientLookupId = useRef(0);
    const pendingIngredientLookups = useRef(
        new Map<number, { index: number; name: string }>(),
    );
    const nutritionFoundDuringSave = useRef<RecipeNutritionEnrichment[]>([]);
    const savedIngredientsByName = useMemo(() => {
        const byName = new Map<string, UserIngredient>();
        for (const ingredient of savedIngredients) {
            const name = normalizeIngredientName(ingredient.name);
            if (!byName.has(name)) byName.set(name, ingredient);
        }
        return byName;
    }, [savedIngredients]);
    const previewIngredient = addingIngredient
        ? findIngredientSource(
              ingredientName,
              meal.ingredients,
              savedIngredientsByName,
          )
        : undefined;
    const previewCalories =
        previewIngredient && Number.isFinite(previewIngredient.caloriesPer100g)
            ? previewIngredient.caloriesPer100g
            : undefined;
    const ingredientCalorieScale = useMemo(
        () => calorieScale(originalMeal.ingredients),
        [originalMeal.ingredients],
    );

    function updateMeal(
        next:
            | GenerateMealResponse
            | ((current: GenerateMealResponse) => GenerateMealResponse),
    ) {
        const updated =
            typeof next === 'function' ? next(mealRef.current) : next;
        mealRef.current = updated;
        setMeal(updated);
    }

    function resetIngredientComposer() {
        addingRef.current = false;
        cancelAddIntent.current = false;
        setAddingIngredient(false);
        setIngredientName('');
    }

    function publishIngredientLookups() {
        setNutritionLookingUpIndices(
            new Set(
                [...pendingIngredientLookups.current.values()].map(
                    ({ index }) => index,
                ),
            ),
        );
    }

    function applyResolvedNutrition(
        index: number,
        nutrition: IngredientInfo,
        expectedName?: string,
    ) {
        updateMeal((current) => {
            const existing = current.ingredients[index];
            if (
                !existing?.nutritionUnavailable ||
                (expectedName && existing.name !== expectedName)
            )
                return current;
            const resolved = withResolvedNutrition(existing, nutrition);
            if (resolved === existing) return current;
            const ingredients = [...current.ingredients];
            ingredients[index] = resolved;
            return { ...current, ingredients };
        });
    }

    function persistFoundNutrition(enrichments: RecipeNutritionEnrichment[]) {
        if (!recipe.id || !enrichments.length) return;
        void fillRecipeNutrition(recipe.id, enrichments).catch(() => {
            // Cached lookup data can be persisted on the next recipe visit.
        });
    }

    function saveFoundNutrition(enrichments: RecipeNutritionEnrichment[]) {
        const ingredients = fillMissingRecipeNutrition(
            mealRef.current.ingredients,
            enrichments,
        );
        if (ingredients === mealRef.current.ingredients) return;
        updateMeal((current) => ({ ...current, ingredients }));
        setOriginalMeal((current) => {
            const originalIngredients = fillMissingRecipeNutrition(
                current.ingredients,
                enrichments,
            );
            return originalIngredients === current.ingredients
                ? current
                : { ...current, ingredients: originalIngredients };
        });
        if (pending.current) {
            nutritionFoundDuringSave.current.push(...enrichments);
        } else {
            persistFoundNutrition(enrichments);
        }
    }

    function discardIngredientLookups() {
        ingredientEditVersion.current += 1;
        pendingIngredientLookups.current.clear();
        publishIngredientLookups();
    }

    function removeIngredient(index: number) {
        let lookupsChanged = false;
        for (const [id, lookup] of pendingIngredientLookups.current) {
            if (lookup.index === index) {
                pendingIngredientLookups.current.delete(id);
                lookupsChanged = true;
            } else if (lookup.index > index) {
                lookup.index -= 1;
                lookupsChanged = true;
            }
        }
        if (lookupsChanged) publishIngredientLookups();
        const removed = mealRef.current.ingredients[index];
        updateMeal((current) => ({
            ...current,
            ingredients: current.ingredients.filter(
                (_, itemIndex) => itemIndex !== index,
            ),
        }));
        if (removed)
            removalUndo.show('Ingredient removed.', () =>
                restoreIngredient(removed, index),
            );
    }

    function restoreIngredient(ingredient: MealIngredient, index: number) {
        const at = Math.min(index, mealRef.current.ingredients.length);
        let lookupsChanged = false;
        for (const lookup of pendingIngredientLookups.current.values()) {
            if (lookup.index >= at) {
                lookup.index += 1;
                lookupsChanged = true;
            }
        }
        if (lookupsChanged) publishIngredientLookups();
        updateMeal((current) => ({
            ...current,
            ingredients: [
                ...current.ingredients.slice(0, at),
                ingredient,
                ...current.ingredients.slice(at),
            ],
        }));
    }

    function commitIngredient(name: string, selected?: IngredientInfo) {
        const trimmed = name.trim();
        if (!addingRef.current || cancelAddIntent.current || !trimmed) return;
        const source = selected ??
            findIngredientSource(
                trimmed,
                mealRef.current.ingredients,
                savedIngredientsByName,
            ) ?? { name: trimmed };
        const addedIngredient = toMealIngredient(source);
        const editVersion = ingredientEditVersion.current;
        const addedIndex = mealRef.current.ingredients.length;
        updateMeal((current) => ({
            ...current,
            ingredients: [...current.ingredients, addedIngredient],
        }));
        if (addedIngredient.nutritionUnavailable) {
            const lookupId = ++nextIngredientLookupId.current;
            pendingIngredientLookups.current.set(lookupId, {
                index: addedIndex,
                name: addedIngredient.name,
            });
            publishIngredientLookups();
            void getIngredientNutrition(trimmed)
                .then((nutrition) => {
                    if (ingredientEditVersion.current !== editVersion) return;
                    const lookup =
                        pendingIngredientLookups.current.get(lookupId);
                    if (!lookup) return;
                    applyResolvedNutrition(
                        lookup.index,
                        nutrition,
                        lookup.name,
                    );
                })
                .catch(() => {})
                .finally(() => {
                    if (pendingIngredientLookups.current.delete(lookupId))
                        publishIngredientLookups();
                });
        }
        resetIngredientComposer();
        setError('');
    }

    function startSection(next: EditSection) {
        if (pending.current) return;
        removalUndo.dismiss();
        discardIngredientLookups();
        resetIngredientComposer();
        updateMeal(originalMeal);
        setSection(next);
        setError('');
    }

    function cancelSection() {
        if (pending.current) return;
        removalUndo.dismiss();
        discardIngredientLookups();
        resetIngredientComposer();
        updateMeal(originalMeal);
        setSection(null);
        setError('');
        if (section === 'ingredients')
            setResetVersion((current) => current + 1);
    }

    async function saveSection() {
        if (pending.current || !section) return;
        removalUndo.dismiss();
        if (section === 'ingredients' && addingRef.current) {
            if (ingredientName.trim()) commitIngredient(ingredientName);
            else resetIngredientComposer();
        }
        const current = mealRef.current;
        const input = recipeInput(current);
        if (!input.recipeName) {
            setError('Enter a recipe name.');
            return;
        }
        if (!input.ingredients.length) {
            setError('Add at least one ingredient.');
            return;
        }
        if (sectionIsUnchanged(section, input, originalMeal)) {
            discardIngredientLookups();
            updateMeal(originalMeal);
            setSection(null);
            resetIngredientComposer();
            setError('');
            if (section === 'ingredients')
                setResetVersion((version) => version + 1);
            return;
        }

        pending.current = true;
        // Keep the pending indicator until its request settles, even after saving.
        ingredientEditVersion.current += 1;
        setSaving(true);
        setError('');
        const savedSection = section;
        if (savedSection === 'ingredients') setSection(null);
        try {
            let updated: Recipe | undefined;
            if (savedSection === 'ingredients') {
                await ingredientFeedback.save(async () => {
                    updated = await onSave?.({ ...recipe, ...input });
                });
            } else {
                updated = await onSave?.({ ...recipe, ...input });
            }
            if (!updated) return;
            const saved = toMeal(updated);
            const enriched = {
                ...saved,
                ingredients: fillMissingRecipeNutrition(
                    saved.ingredients,
                    nutritionFoundDuringSave.current,
                ),
            };
            setOriginalMeal(enriched);
            updateMeal(enriched);
            setSection(null);
            resetIngredientComposer();
            if (savedSection === 'ingredients') {
                setResetVersion((version) => version + 1);
            }
        } catch {
            if (savedSection === 'ingredients') setSection(savedSection);
            setError(
                'Could not save your changes. Your edits are still here; please try again.',
            );
        } finally {
            pending.current = false;
            const foundDuringSave = nutritionFoundDuringSave.current.splice(0);
            persistFoundNutrition(foundDuringSave);
            setSaving(false);
        }
    }

    const editingName = section === 'name';
    // Before paint, so the header and the name field switch together.
    useLayoutEffect(() => {
        if (!editingName) return;
        onNameEditingChange?.({ formId: NAME_FORM_ID, saving });
        return () => onNameEditingChange?.(null);
    }, [editingName, saving, onNameEditingChange]);

    const actions = section ? (
        <SectionActions
            section={section}
            saving={saving}
            onSave={saveSection}
            onCancel={cancelSection}
        />
    ) : null;

    return (
        <div className="recipe-detail">
            <span className="recipe-detail-saving-announcement" role="status">
                {saving && section ? 'Saving changes…' : ''}
            </span>
            {error && (
                <p className="recipe-detail-error" role="alert">
                    {error}
                </p>
            )}
            {editingName && (
                // The header ✕ / ✓ (and Enter / Esc in the field) reset or
                // submit this form.
                <form
                    id={NAME_FORM_ID}
                    hidden
                    onSubmit={(event) => {
                        event.preventDefault();
                        void saveSection();
                    }}
                    onReset={(event) => {
                        event.preventDefault();
                        cancelSection();
                    }}
                />
            )}
            <div aria-busy={saving} inert={saving}>
                <MealResult
                    key={resetVersion}
                    summaryVariant="card"
                    meal={meal}
                    originalMeal={originalMeal}
                    onChange={updateMeal}
                    showBookmark={planMeal}
                    onSavedRecipesChange={onSavedRecipesChange}
                    showPartialNutrition
                    journalControl={{
                        entryId: journalEntryId,
                        onChange: setJournalEntryId,
                    }}
                    // The + stays while editing (adding the values on screen), so
                    // the header never changes.
                    showJournalButton={!planMeal}
                    showWeightControls={section === 'ingredients'}
                    // Edit mode hides the › but keeps its space, so names
                    // wrap the same and rows never move.
                    showIngredientChevron={
                        section === 'ingredients' ? 'space' : true
                    }
                    onNameEdit={() => startSection('name')}
                    nameEditDisabled={Boolean(section)}
                    nameFormId={NAME_FORM_ID}
                    onNameChange={
                        section === 'name'
                            ? (name) =>
                                  updateMeal((current) => ({
                                      ...current,
                                      mealName: name,
                                  }))
                            : undefined
                    }
                    ingredientActions={
                        section === 'ingredients' ? (
                            <IngredientSectionActions
                                editing
                                saving={saving}
                                onSave={saveSection}
                                onCancel={cancelSection}
                            />
                        ) : !section ? (
                            <IngredientSectionActions
                                editing={false}
                                onEdit={() => startSection('ingredients')}
                            />
                        ) : undefined
                    }
                    ingredientEditing={section === 'ingredients'}
                    nutritionLookingUpIndices={nutritionLookingUpIndices}
                    ingredientFeedback={ingredientFeedback}
                    onRemoveIngredient={
                        section === 'ingredients' ? removeIngredient : undefined
                    }
                    onIngredientNutritionResolved={applyResolvedNutrition}
                    onNutritionFound={saveFoundNutrition}
                    ingredientComposer={
                        section === 'ingredients' ? (
                            <>
                                {addingIngredient && (
                                    <div className="recipe-detail-new-ingredient meal-ingredient">
                                        <IngredientThumbnail
                                            name={
                                                ingredientName || 'Ingredient'
                                            }
                                        />
                                        <div className="recipe-detail-new-ingredient-main">
                                            <RecipeIngredientNameInput
                                                value={ingredientName}
                                                index={meal.ingredients.length}
                                                focusInput={(node) => {
                                                    if (node && !ingredientName)
                                                        node.focus({
                                                            preventScroll: true,
                                                        });
                                                }}
                                                savedIngredients={
                                                    savedIngredients
                                                }
                                                onChange={setIngredientName}
                                                onCommit={(name, source) => {
                                                    commitIngredient(
                                                        name,
                                                        source,
                                                    );
                                                }}
                                                onOpenSheet={() => {}}
                                            />
                                            <IngredientCalorieContribution
                                                name={
                                                    ingredientName.trim() ||
                                                    'Ingredient'
                                                }
                                                calories={previewCalories}
                                                scale={ingredientCalorieScale}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="recipe-detail-new-ingredient-cancel"
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
                                            onClick={() =>
                                                resetIngredientComposer()
                                            }
                                        >
                                            <CloseIcon />
                                        </button>
                                    </div>
                                )}
                                <AddRowButton
                                    label="Add ingredient"
                                    onClick={() => {
                                        addingRef.current = true;
                                        setAddingIngredient(true);
                                    }}
                                />
                            </>
                        ) : undefined
                    }
                    onStepsEdit={
                        section || planMeal
                            ? undefined
                            : () => startSection('steps')
                    }
                    stepsActions={section === 'steps' ? actions : undefined}
                    instructionEditor={
                        section === 'steps'
                            ? {
                                  editing: true,
                                  canReset: false,
                                  onReset: () => {},
                                  onChange: (value) =>
                                      updateMeal((current) => ({
                                          ...current,
                                          instructions: value.split('\n'),
                                      })),
                                  disabled: saving,
                              }
                            : undefined
                    }
                />
            </div>
            {removalUndo.undoToast}
        </div>
    );
}
