import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { useSaveOnLeave } from '../hooks/useSaveOnLeave';
import { useUndoToast } from '../hooks/useUndoToast';
import { RecipeIngredientNameInput } from '../CreateRecipe';
import IngredientThumbnail from '../meal-generator/components/IngredientThumbnail';
import IngredientSectionRow from '../components/IngredientSectionRow';
import SwipeableIngredientRow from '../meal-generator/components/SwipeableIngredientRow';
import { findCommonQuickAddIngredient } from '../meal-generator/components/commonQuickAddIngredients';
import { normalizeIngredientName } from '../utils/Ingredient';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
} from '../services/micronutrientService';
import {
    hasUnavailableNutrition,
    knownNutritionIngredients,
    totalNutrition,
} from '../utils/nutrition';
import '../meal-generator/components/MealResult.css';
import AddRowButton from '../components/AddRowButton';

function amount(value: number) {
    return Number(value.toFixed(1));
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

function withResolvedNutrition(
    ingredient: MealIngredient,
    nutrition: IngredientInfo,
): MealIngredient {
    if (
        !ingredient.nutritionUnavailable ||
        [
            nutrition.caloriesPer100g,
            nutrition.proteinPer100g,
            nutrition.carbohydratePer100g,
            nutrition.fatPer100g,
        ].some((value) => !Number.isFinite(value) || Number(value) < 0)
    )
        return ingredient;
    const resolved: MealIngredient = {
        ...nutrition,
        ...ingredient,
        caloriesPer100g: nutrition.caloriesPer100g!,
        proteinPer100g: nutrition.proteinPer100g!,
        carbohydratePer100g: nutrition.carbohydratePer100g!,
        fatPer100g: nutrition.fatPer100g!,
        resolvedName: nutrition.resolvedName ?? nutrition.name,
        nutritionSource:
            nutrition.nutritionSource ?? ingredient.nutritionSource,
    };
    delete resolved.nutritionUnavailable;
    return resolved;
}

function matchingMealIngredient(
    name: string,
    ingredients: MealIngredient[],
): MealIngredient | undefined {
    const normalized = normalizeIngredientName(name);
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

function cachedIngredient(name: string): IngredientInfo | undefined {
    const cached = getCachedIngredientNutrition(name);
    return cached
        ? {
              ...cached,
              name,
              resolvedName: cached.resolvedName ?? cached.name,
          }
        : undefined;
}

export default function JournalMealIngredients({
    entry,
    expanded = true,
    actionsContainer,
    disabled,
    savedIngredients,
    onSave,
    onEditingChange,
}: {
    entry: JournalEntry;
    /** Whether the meal card is open; header actions only show while it is. */
    expanded?: boolean;
    /**
     * The meal header slot beside the disclosure chevron. Edit, cancel and
     * save render there so they share one stable trailing column.
     */
    actionsContainer?: HTMLElement | null;
    disabled: boolean;
    savedIngredients: UserIngredient[];
    onSave: (ingredients: MealIngredient[]) => Promise<JournalEntry>;
    /** Lets the meal header switch to its calmer edit layout. */
    onEditingChange?: (editing: boolean) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<MealIngredient[]>([]);
    const draftRef = useRef<MealIngredient[]>([]);
    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );
    const [adding, setAdding] = useState(false);
    const [ingredientName, setIngredientName] = useState('');
    const [openSwipeIndex, setOpenSwipeIndex] = useState<number | null>(null);
    const feedback = useIngredientSectionSave();
    const { saving } = feedback;
    const [error, setError] = useState('');
    const [nutritionLookingUpNames, setNutritionLookingUpNames] = useState(
        () => new Set<string>(),
    );
    const pendingNutrition = useRef(
        new Map<string, Promise<IngredientInfo | undefined>>(),
    );
    const lookupGeneration = useRef(0);
    const [viewOverride, setViewOverride] = useState<{
        entry: JournalEntry;
        ingredients: MealIngredient[];
    } | null>(null);
    const viewOverrideRef = useRef(viewOverride);
    const currentEntryRef = useRef(entry);
    useLayoutEffect(() => {
        currentEntryRef.current = entry;
    }, [entry]);
    const cancelAddIntent = useRef(false);
    const addingRef = useRef(false);
    // True while there are edits that have not been saved or discarded.
    const editingRef = useRef(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const discardUndo = useUndoToast();
    const entryIngredients =
        viewOverride?.entry === entry
            ? viewOverride.ingredients
            : entry.ingredients;
    const ingredients = editing || saving ? draft : entryIngredients;
    const knownIngredients = knownNutritionIngredients(ingredients);
    const totals = totalNutrition(knownIngredients);
    const incompleteNutrition = hasUnavailableNutrition(ingredients);
    const largestIngredientCalories = Math.max(
        0,
        ...ingredients.map((ingredient) =>
            ingredient.nutritionUnavailable
                ? 0
                : (ingredient.caloriesPer100g * ingredient.weight) / 100,
        ),
    );
    const ingredientCalorieScale = Math.max(
        500,
        Math.ceil((largestIngredientCalories * 2) / 100) * 100,
    );

    function updateDraft(
        next:
            | MealIngredient[]
            | ((current: MealIngredient[]) => MealIngredient[]),
    ) {
        const updated =
            typeof next === 'function' ? next(draftRef.current) : next;
        draftRef.current = updated;
        setDraft(updated);
    }

    function startNutritionLookup(name: string) {
        const key = normalizeIngredientName(name);
        const existing = pendingNutrition.current.get(key);
        if (existing) return existing;
        const generation = lookupGeneration.current;
        const request = getIngredientNutrition(name).catch(() => undefined);
        pendingNutrition.current.set(key, request);
        setNutritionLookingUpNames((current) => new Set(current).add(key));
        void request
            .then((nutrition) => {
                if (lookupGeneration.current !== generation || !nutrition)
                    return;
                updateDraft((current) =>
                    current.map((ingredient) =>
                        normalizeIngredientName(ingredient.name) === key
                            ? withResolvedNutrition(ingredient, nutrition)
                            : ingredient,
                    ),
                );
            })
            .finally(() => {
                if (pendingNutrition.current.get(key) !== request) return;
                pendingNutrition.current.delete(key);
                setNutritionLookingUpNames((current) => {
                    const next = new Set(current);
                    next.delete(key);
                    return next;
                });
            });
        return request;
    }

    function resolveSheetNutrition(index: number, nutrition: IngredientInfo) {
        const name = ingredients[index]?.name;
        if (!name) return;
        const key = normalizeIngredientName(name);
        if (editing || saving) {
            updateDraft((current) =>
                current.map((ingredient) =>
                    normalizeIngredientName(ingredient.name) === key &&
                    ingredient.nutritionUnavailable
                        ? withResolvedNutrition(ingredient, nutrition)
                        : ingredient,
                ),
            );
            return;
        }
        const current =
            viewOverrideRef.current?.entry === entry
                ? viewOverrideRef.current.ingredients
                : entry.ingredients;
        const next = current.map((ingredient) =>
            normalizeIngredientName(ingredient.name) === key
                ? withResolvedNutrition(ingredient, nutrition)
                : ingredient,
        );
        if (
            next.every(
                (ingredient, itemIndex) => ingredient === current[itemIndex],
            )
        )
            return;
        const override = { entry, ingredients: next };
        viewOverrideRef.current = override;
        setViewOverride(override);
        setError('');
        void onSave(next).catch(() => {
            if (viewOverrideRef.current === override) {
                viewOverrideRef.current = null;
                setViewOverride(null);
            }
            setError('Could not save nutrition. Please try again.');
        });
    }

    function startEditing() {
        lookupGeneration.current += 1;
        pendingNutrition.current.clear();
        setNutritionLookingUpNames(new Set());
        updateDraft(entryIngredients.map((ingredient) => ({ ...ingredient })));
        setWeightDrafts({});
        addingRef.current = false;
        setAdding(false);
        setIngredientName('');
        setOpenSwipeIndex(null);
        setError('');
        editingRef.current = true;
        setEditing(true);
    }

    function finishEditing() {
        if (saving) return;
        editingRef.current = false;
        lookupGeneration.current += 1;
        pendingNutrition.current.clear();
        setNutritionLookingUpNames(new Set());
        addingRef.current = false;
        setEditing(false);
        setAdding(false);
        setIngredientName('');
        setWeightDrafts({});
        setOpenSwipeIndex(null);
        setError('');
    }

    /** ✕ discards the edit, with Undo in case it was tapped by mistake. */
    function discardEditing() {
        if (saving) return;
        const pendingName = addingRef.current ? ingredientName.trim() : '';
        const snapshot = draftRef.current;
        const changed = pendingName || !isUnchanged(snapshot);
        finishEditing();
        if (!changed) return;
        discardUndo.show('Changes discarded.', () => {
            updateDraft(snapshot);
            addingRef.current = Boolean(pendingName);
            setAdding(Boolean(pendingName));
            setIngredientName(pendingName);
            editingRef.current = true;
            setEditing(true);
        });
    }

    /** The best nutrition already known for a typed name, before any lookup. */
    function ingredientFromName(name: string): MealIngredient {
        const key = normalizeIngredientName(name);
        return newIngredient(
            matchingMealIngredient(name, draftRef.current) ??
                savedIngredients.find(
                    (ingredient) =>
                        normalizeIngredientName(ingredient.name) === key,
                ) ??
                findCommonQuickAddIngredient(name) ??
                cachedIngredient(name) ?? { name },
        );
    }

    const isUnchanged = (list: MealIngredient[]) =>
        JSON.stringify(list) === JSON.stringify(entryIngredients);

    function commitIngredient(name: string, selected?: IngredientInfo) {
        const trimmed = name.trim();
        if (!addingRef.current || !trimmed || cancelAddIntent.current) return;
        addingRef.current = false;
        const added = selected
            ? newIngredient(selected)
            : ingredientFromName(trimmed);
        updateDraft((current) => [...current, added]);
        if (added.nutritionUnavailable) void startNutritionLookup(trimmed);
        setIngredientName('');
        setAdding(false);
        setError('');
    }

    async function saveIngredients() {
        if (saving) return;
        // A name already committed on blur is in the draft; only a name still
        // in the field is added here.
        const pendingName = addingRef.current ? ingredientName.trim() : '';
        addingRef.current = false;
        const next = pendingName
            ? [...draftRef.current, ingredientFromName(pendingName)]
            : draftRef.current;
        if (!next.length) {
            setError('Add at least one ingredient.');
            return;
        }
        editingRef.current = false;
        if (isUnchanged(next)) {
            finishEditing();
            return;
        }
        updateDraft(next);
        setEditing(false);
        setError('');
        const pending = next.flatMap((ingredient) => {
            if (!ingredient.nutritionUnavailable) return [];
            const request = pendingNutrition.current.get(
                normalizeIngredientName(ingredient.name),
            );
            return request ? [[ingredient.name, request] as const] : [];
        });
        if (pendingName) {
            const added = next.at(-1);
            if (added?.nutritionUnavailable)
                pending.push([added.name, startNutritionLookup(added.name)]);
        }
        const generation = lookupGeneration.current;
        try {
            let saved: JournalEntry | undefined;
            await feedback.save(async () => {
                saved = await onSave(next);
            });
            if (saved && pending.length) {
                const savedEntry = saved;
                void Promise.all(
                    pending.map(
                        async ([name, request]) =>
                            [
                                normalizeIngredientName(name),
                                await request,
                            ] as const,
                    ),
                ).then(async (resolved) => {
                    if (lookupGeneration.current !== generation) return;
                    const latest = currentEntryRef.current;
                    const current =
                        viewOverrideRef.current?.entry === savedEntry
                            ? viewOverrideRef.current.ingredients
                            : savedEntry.ingredients;
                    const nutritionByName = new Map(resolved);
                    const ready = current.map((ingredient) => {
                        const nutrition = nutritionByName.get(
                            normalizeIngredientName(ingredient.name),
                        );
                        return nutrition
                            ? withResolvedNutrition(ingredient, nutrition)
                            : ingredient;
                    });
                    if (
                        ready.every(
                            (ingredient, index) =>
                                ingredient === current[index],
                        )
                    )
                        return;
                    const override = {
                        entry: latest === entry ? savedEntry : latest,
                        ingredients: ready,
                    };
                    viewOverrideRef.current = override;
                    setViewOverride(override);
                    try {
                        await onSave(ready);
                    } catch {
                        if (viewOverrideRef.current === override) {
                            viewOverrideRef.current = null;
                            setViewOverride(null);
                        }
                        setError('Could not save nutrition. Please try again.');
                    }
                });
            }
            setAdding(false);
            setIngredientName('');
            setWeightDrafts({});
            setOpenSwipeIndex(null);
        } catch {
            editingRef.current = true;
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
        updateDraft((current) =>
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

    const actions = (
        <IngredientSectionActions
            editing={editing || saving}
            saving={saving}
            disabled={disabled}
            editLabel={`Edit ingredients in ${entry.mealName}`}
            onEdit={() => {
                discardUndo.dismiss();
                startEditing();
            }}
            onCancel={discardEditing}
            onSave={() => void saveIngredients()}
        />
    );

    const onEditingChangeRef = useRef(onEditingChange);
    useLayoutEffect(() => {
        onEditingChangeRef.current = onEditingChange;
    });
    // Report before paint, and keep the edit header until a save finishes,
    // so the row never shows ✕ / ✓ alongside the normal icons.
    const headerEditing = editing || saving;
    useLayoutEffect(() => {
        if (!headerEditing) return;
        onEditingChangeRef.current?.(true);
        return () => onEditingChangeRef.current?.(false);
    }, [headerEditing]);

    // Moving on without ✓ saves the edit; only ✕ discards it.
    useSaveOnLeave({
        active: editing,
        containers: () => [contentRef.current, actionsContainer],
        onLeave: () => {
            if (editingRef.current) void saveIngredients();
        },
    });

    return (
        <div
            ref={contentRef}
            className="journal-meal-content"
            aria-busy={saving}
        >
            {actionsContainer ? (
                expanded && createPortal(actions, actionsContainer)
            ) : (
                <div className="journal-meal-ingredient-actions">{actions}</div>
            )}
            <IngredientSection
                className="journal-meal-ingredients-section"
                showHeading={false}
                editing={editing}
                feedback={feedback}
                error={error}
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
                                        updateDraft((current) =>
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
                                        showChevron="space"
                                        nutritionLookingUp={nutritionLookingUpNames.has(
                                            normalizeIngredientName(
                                                ingredient.name,
                                            ),
                                        )}
                                        onNutritionResolved={(nutrition) =>
                                            resolveSheetNutrition(
                                                index,
                                                nutrition,
                                            )
                                        }
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
                                    nutritionLookingUp={nutritionLookingUpNames.has(
                                        normalizeIngredientName(
                                            ingredient.name,
                                        ),
                                    )}
                                    onNutritionResolved={(nutrition) =>
                                        resolveSheetNutrition(index, nutrition)
                                    }
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
                                        addingRef.current = false;
                                        setAdding(false);
                                        setIngredientName('');
                                    }}
                                >
                                    <CloseIcon />
                                </button>
                            </div>
                        )}
                        <AddRowButton
                            label="Add ingredient"
                            disabled={saving}
                            onClick={() => {
                                addingRef.current = true;
                                setAdding(true);
                            }}
                        />
                    </>
                )}
            </IngredientSection>
            <div
                className="journal-meal-total"
                role="group"
                aria-label="Meal total"
            >
                {knownIngredients.length ? (
                    <>
                        <span className="journal-meal-total-line">
                            <strong>Total:</strong> {amount(totals.calories)}
                            {' kcal · '}
                            {amount(totals.protein)}
                            {' g protein · '}
                            {amount(totals.carbohydrate)}
                            {' g carbs · '}
                            {amount(totals.fat)} g fat
                        </span>
                        {incompleteNutrition && (
                            <small>
                                Based on ingredients with available nutrition
                                data
                            </small>
                        )}
                    </>
                ) : (
                    'Nutrition unavailable for some ingredients.'
                )}
            </div>
            {/* Outside the card, so Undo still works if the meal collapses. */}
            {discardUndo.undoToast &&
                createPortal(discardUndo.undoToast, document.body)}
        </div>
    );
}
