import {
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
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
import { revealAboveKeyboard } from '../utils/revealAboveKeyboard';
import { useUndoToast } from '../hooks/useUndoToast';
import { IngredientCollectionContext } from '../ingredients/IngredientCollectionContext';
import { RecipeIngredientNameInput } from '../CreateRecipe';
import IngredientThumbnail from '../meal-generator/components/IngredientThumbnail';
import IngredientSectionRow from '../components/IngredientSectionRow';
import SwipeableIngredientRow from '../meal-generator/components/SwipeableIngredientRow';
import { findCommonQuickAddIngredient } from '../meal-generator/components/commonQuickAddIngredients';
import { normalizeIngredientName } from '../utils/Ingredient';
import { fromSheet, newIngredient } from '../utils/mealIngredient';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
} from '../services/micronutrientService';
import {
    calorieScale,
    hasUnavailableNutrition,
    knownNutritionIngredients,
    totalNutrition,
} from '../utils/nutrition';
import '../meal-generator/components/MealResult.css';

function amount(value: number) {
    return Number(value.toFixed(1));
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

/**
 * An entry after a nutrition sheet fix: the fixed nutrition at the same
 * weight, under the typed name (or the sheet's new name for a rename).
 */
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
    isNew = false,
    initialDraft,
    onDiscardNew,
    onHeaderActions,
    editRequest,
    nameChanged = false,
    onDiscardName,
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
    /**
     * A meal being created in place: it opens in edit mode with the
     * ingredient field focused, and saving creates it.
     */
    isNew?: boolean;
    /** Ingredients a new meal starts with (restored by Undo). */
    initialDraft?: MealIngredient[];
    /** ✕, or leaving a new meal with nothing added, drops it. */
    onDiscardNew?: (draft: MealIngredient[]) => void;
    /** Changes each time the meal's menu asks to edit it. */
    editRequest?: number;
    /** The meal's name was changed in this edit, so ✓ saves even if the
     *  ingredients are the same. */
    nameChanged?: boolean;
    /** ✕ drops the name change too; the returned function restores it
     *  (Undo). */
    onDiscardName?: () => () => void;
    /**
     * Hosts ✕ / ✓ in the app header while editing, so the meal itself only
     * shows its name and ingredients. Without it they sit in the meal row.
     */
    onHeaderActions?: (
        actions: {
            saving: boolean;
            onCancel: () => void;
            onSave: () => void;
        } | null,
    ) => void;
}) {
    const [editing, setEditing] = useState(isNew);
    const [draft, setDraft] = useState<MealIngredient[]>(
        () => initialDraft ?? [],
    );
    const draftRef = useRef<MealIngredient[]>(draft);
    const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>(
        {},
    );
    const startAdding = isNew && !initialDraft?.length;
    const [adding, setAdding] = useState(startAdding);
    const [ingredientName, setIngredientName] = useState('');
    const [openSwipeIndex, setOpenSwipeIndex] = useState<number | null>(null);
    // An added ingredient's name being corrected in place.
    const [renaming, setRenaming] = useState<{
        index: number;
        value: string;
    } | null>(null);
    const renamingRef = useRef(renaming);
    const feedback = useIngredientSectionSave();
    const { saving } = feedback;
    const [error, setError] = useState('');
    // A field in this meal has the keyboard (an ingredient name or weight).
    const [typing, setTyping] = useState(false);
    // Creating a new meal says so; the card stops being new mid-save.
    const [creating, setCreating] = useState(false);
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
    const addingRef = useRef(startAdding);
    // True while there are edits that have not been saved or discarded.
    const editingRef = useRef(isNew);
    const contentRef = useRef<HTMLDivElement>(null);
    const discardUndo = useUndoToast();
    const ingredientCollection = useContext(IngredientCollectionContext);
    const entryIngredients =
        viewOverride?.entry === entry
            ? viewOverride.ingredients
            : entry.ingredients;
    const ingredients = editing || saving ? draft : entryIngredients;
    // Entering a name or weight: extra controls step aside until done.
    const keyboardUp = editing && (adding || typing);
    const knownIngredients = knownNutritionIngredients(ingredients);
    const totals = totalNutrition(knownIngredients);
    const incompleteNutrition = hasUnavailableNutrition(ingredients);
    const ingredientCalorieScale = calorieScale(ingredients);

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

    /**
     * A fix from the nutrition sheet's "Doesn't look right?" menu (another
     * food, a label scan or corrected numbers) replaces this entry's
     * nutrition, keeping the typed name and the weight, and saves at once.
     * A matching saved ingredient is updated too, as in Create Recipe.
     * Throwing lets the sheet show its own error.
     */
    /**
     * Saves a sheet fix. Fixes keep the typed name; a rename from the sheet's
     * title (`rename`) takes the new name, keeping the nutrition and weight.
     */
    async function saveSheetNutrition(
        index: number,
        corrected: IngredientInfo,
        saveToUserIngredients: boolean,
        rename = false,
    ) {
        if (saveToUserIngredients) await ingredientCollection?.save(corrected);
        const withFix = (current: MealIngredient[]) =>
            current.map((ingredient, itemIndex) =>
                itemIndex === index
                    ? fromSheet(ingredient, corrected, rename)
                    : ingredient,
            );
        // While editing, a fix joins the draft: ✓ (or leaving) saves it and
        // ✕ discards it with the rest.
        if (editing || saving) {
            updateDraft(withFix);
            return;
        }
        const current =
            viewOverrideRef.current?.entry === entry
                ? viewOverrideRef.current.ingredients
                : entry.ingredients;
        if (!current[index]) return;
        const next = withFix(current);
        const override = { entry, ingredients: next };
        viewOverrideRef.current = override;
        setViewOverride(override);
        setError('');
        try {
            await onSave(next);
        } catch (saveError) {
            if (viewOverrideRef.current === override) {
                viewOverrideRef.current = null;
                setViewOverride(null);
            }
            throw saveError;
        }
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
        updateRenaming(null);
        setError('');
        // A field removed while focused (e.g. saved on leaving the app)
        // fires no blur, so never carry "typing" into a new edit.
        setTyping(false);
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
        updateRenaming(null);
        setError('');
    }

    /** ✕ discards the edit, with Undo in case it was tapped by mistake. */
    function discardEditing() {
        if (saving) return;
        const pendingName = addingRef.current ? ingredientName.trim() : '';
        const snapshot = draftRef.current;
        const rename = renamingRef.current;
        const changed =
            pendingName ||
            (rename && rename.value.trim() !== snapshot[rename.index]?.name) ||
            nameChanged ||
            !isUnchanged(snapshot);
        const restoreName = onDiscardName?.();
        finishEditing();
        if (isNew) {
            onDiscardNew?.(
                pendingName
                    ? [...snapshot, ingredientFromName(pendingName)]
                    : snapshot,
            );
            return;
        }
        if (!changed) return;
        discardUndo.show('Changes discarded.', () => {
            restoreName?.();
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

    // A new meal is never unchanged: saving it is what creates it.
    const isUnchanged = (list: MealIngredient[]) =>
        !isNew && JSON.stringify(list) === JSON.stringify(entryIngredients);

    /**
     * Opens the name field. Rendered at once, so its focus lands within the
     * tap or key press and mobile keyboards open (or stay open).
     */
    function openComposer() {
        flushSync(() => {
            addingRef.current = true;
            setAdding(true);
        });
    }

    function closeComposer() {
        // Removing the focused name field fires no blur.
        if (composerInput() === document.activeElement) setTyping(false);
        addingRef.current = false;
        setIngredientName('');
        setAdding(false);
    }

    function updateRenaming(next: { index: number; value: string } | null) {
        renamingRef.current = next;
        setRenaming(next);
    }

    /**
     * Tapping a name while editing turns it into the search field, filled in
     * with the caret at the end, so a typo is fixed without retyping. Focus
     * lands within the tap so the keyboard opens.
     */
    function startRename(index: number) {
        const ingredient = draftRef.current[index];
        if (!ingredient || saving) return;
        setOpenSwipeIndex(null);
        flushSync(() => updateRenaming({ index, value: ingredient.name }));
        const input = contentRef.current?.querySelector<HTMLInputElement>(
            '.journal-ingredient-rename input',
        );
        if (!input) return;
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
    }

    /** Closes the rename field without changing the ingredient. */
    function cancelRename() {
        if (!renamingRef.current) return;
        // Removing the focused field fires no blur.
        setTyping(false);
        updateRenaming(null);
    }

    /** Enter, a picked suggestion or leaving the field renames. */
    function commitRename(name: string, selected?: IngredientInfo) {
        const rename = renamingRef.current;
        if (!rename) return;
        cancelRename();
        renameIngredient(rename.index, name, selected);
    }

    /**
     * Gives an ingredient a new name and that name's nutrition, keeping its
     * weight. The same name (ignoring case and spacing) keeps its nutrition.
     */
    function renameIngredient(
        index: number,
        name: string,
        selected?: IngredientInfo,
    ) {
        const trimmed = name.trim();
        const current = draftRef.current[index];
        if (!trimmed || !current) return;
        let renamed: MealIngredient;
        if (
            !selected &&
            normalizeIngredientName(trimmed) ===
                normalizeIngredientName(current.name)
        ) {
            if (trimmed === current.name) return;
            renamed = { ...current, name: trimmed };
        } else {
            const replacement = selected
                ? newIngredient(selected)
                : ingredientFromName(trimmed);
            renamed = {
                ...replacement,
                name: selected ? replacement.name : trimmed,
                weight: current.weight,
            };
        }
        updateDraft((ingredients) =>
            ingredients.map((ingredient, itemIndex) =>
                itemIndex === index ? renamed : ingredient,
            ),
        );
        setWeightDrafts((drafts) => {
            const next = { ...drafts };
            delete next[index];
            return next;
        });
        setError('');
        if (renamed.nutritionUnavailable)
            void startNutritionLookup(renamed.name);
    }

    /**
     * Tapping a weight in view mode edits it straight away: edit mode opens
     * with that weight focused and selected, within the tap, so the keyboard
     * comes up and typing replaces the number.
     */
    function editWeight(index: number) {
        if (disabled || saving) return;
        discardUndo.dismiss();
        flushSync(startEditing);
        weightInput(index)?.focus({ preventScroll: true });
    }

    /** The ＋ outside edit mode: start editing with the name field open. */
    function addFromView() {
        if (disabled || saving) return;
        discardUndo.dismiss();
        flushSync(() => {
            startEditing();
            addingRef.current = true;
            setAdding(true);
        });
        composerInput()?.focus({ preventScroll: true });
    }

    function composerInput() {
        return contentRef.current?.querySelector<HTMLInputElement>(
            '.journal-ingredient-composer input',
        );
    }

    function weightInput(index: number) {
        return contentRef.current?.querySelectorAll<HTMLInputElement>(
            '.journal-ingredient-edit-row input[type="number"]',
        )[index];
    }

    /**
     * Adds the typed ingredient. Enter (or a picked suggestion) keeps the
     * keyboard up and moves straight to its weight, so a run of ingredients
     * is entered without the keyboard closing and the page jumping. Enter on
     * an empty name finishes adding.
     */
    function commitIngredient(
        name: string,
        selected?: IngredientInfo,
        submitted = false,
    ) {
        const trimmed = name.trim();
        if (!addingRef.current || cancelAddIntent.current) return;
        if (!trimmed) {
            if (submitted) closeComposer();
            return;
        }
        addingRef.current = false;
        const added = selected
            ? newIngredient(selected)
            : ingredientFromName(trimmed);
        if (submitted) {
            // Render the row now so focus moves within this key press, which
            // mobile browsers need to keep the keyboard open.
            const index = draftRef.current.length;
            flushSync(() => updateDraft((current) => [...current, added]));
            weightInput(index)?.focus({ preventScroll: true });
        } else {
            updateDraft((current) => [...current, added]);
        }
        if (added.nutritionUnavailable) void startNutritionLookup(trimmed);
        closeComposer();
        setError('');
    }

    async function saveIngredients({ leaving = false } = {}) {
        if (saving) return;
        // A correction still in its field counts, like ✓ after Enter.
        const rename = renamingRef.current;
        if (rename) {
            updateRenaming(null);
            renameIngredient(rename.index, rename.value);
        }
        // A name already committed on blur is in the draft; only a name still
        // in the field is added here.
        const pendingName = addingRef.current ? ingredientName.trim() : '';
        addingRef.current = false;
        const next = pendingName
            ? [...draftRef.current, ingredientFromName(pendingName)]
            : draftRef.current;
        if (!next.length) {
            if (isNew && leaving) {
                // Nothing to keep: walking away from an empty new meal drops it.
                editingRef.current = false;
                onDiscardNew?.([]);
                return;
            }
            setError('Add at least one ingredient.');
            return;
        }
        editingRef.current = false;
        if (!nameChanged && isUnchanged(next)) {
            finishEditing();
            return;
        }
        updateDraft(next);
        setCreating(isNew);
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
            setError('Could not save ingredients. Please try again.');
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

    // No pen: editing starts from the meal's menu (long press or
    // right-click), a tapped weight or ＋. Only ✕ / ✓ remain, and those move
    // to the app header when it can host them.
    const actions =
        !(editing || saving) || onHeaderActions ? null : (
            <IngredientSectionActions
                editing
                saving={saving}
                onCancel={discardEditing}
                onSave={() => void saveIngredients()}
            />
        );

    // "Edit" from the meal's menu.
    const lastEditRequest = useRef(editRequest);
    useEffect(() => {
        if (editRequest === lastEditRequest.current) return;
        lastEditRequest.current = editRequest;
        if (editingRef.current || saving || disabled) return;
        discardUndo.dismiss();
        startEditing();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- on request only
    }, [editRequest]);

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

    // ✕ / ✓ in the app header, kept pointing at the latest handlers.
    const headerHandlers = useRef({ discardEditing, saveIngredients });
    useLayoutEffect(() => {
        headerHandlers.current = { discardEditing, saveIngredients };
    });
    const onHeaderActionsRef = useRef(onHeaderActions);
    useLayoutEffect(() => {
        onHeaderActionsRef.current = onHeaderActions;
    });
    useLayoutEffect(() => {
        if (!headerEditing) return;
        onHeaderActionsRef.current?.({
            saving,
            onCancel: () => headerHandlers.current.discardEditing(),
            onSave: () => void headerHandlers.current.saveIngredients(),
        });
    }, [headerEditing, saving]);
    useLayoutEffect(() => {
        if (!headerEditing) return;
        return () => onHeaderActionsRef.current?.(null);
    }, [headerEditing]);

    // Moving on without ✓ saves the edit; only ✕ discards it.
    useSaveOnLeave({
        active: editing,
        containers: () => [contentRef.current, actionsContainer],
        onLeave: () => {
            if (editingRef.current) void saveIngredients({ leaving: true });
        },
    });

    // A new meal starts typing straight away. This runs after the Add Meal
    // sheet has closed and returned focus, so it is not taken back.
    useEffect(() => {
        if (isNew) composerInput()?.focus({ preventScroll: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only
    }, []);

    return (
        <div
            ref={contentRef}
            className="journal-meal-content"
            aria-busy={saving}
            onFocus={(event) => {
                // Only this meal's own fields: React also bubbles focus from
                // portalled sheets (nutrition fixes, food search), whose
                // fields can close without a blur.
                if (
                    event.target.matches('input, textarea') &&
                    event.currentTarget.contains(event.target)
                )
                    setTyping(true);
            }}
            onBlur={(event) => {
                // Moving between this meal's fields keeps the keyboard up.
                const next = event.relatedTarget;
                if (
                    !(next instanceof Element) ||
                    !next.matches('input, textarea') ||
                    !event.currentTarget.contains(next)
                )
                    setTyping(false);
            }}
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
                messages={
                    creating
                        ? { saving: 'Adding meal…', saved: 'Meal added.' }
                        : undefined
                }
                error={error}
            >
                <ul
                    className={`journal-meal-ingredients${editing ? ' journal-meal-ingredients-editing' : ''}`}
                >
                    {ingredients.map((ingredient, index) => (
                        <li
                            // In view mode, keyed by position: renaming from
                            // the nutrition sheet keeps the row (and its open
                            // sheet) mounted.
                            key={
                                editing
                                    ? `${ingredient.name}-${index}`
                                    : `view-${index}`
                            }
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
                                        // The name renames; the picture
                                        // opens the nutrition sheet.
                                        showChevron="space"
                                        onNameClick={() => startRename(index)}
                                        onSaveNutrition={(
                                            corrected,
                                            saveToUserIngredients,
                                        ) =>
                                            saveSheetNutrition(
                                                index,
                                                corrected,
                                                saveToUserIngredients,
                                            )
                                        }
                                        nameEditor={
                                            renaming?.index === index && (
                                                <div
                                                    className="journal-ingredient-rename"
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key ===
                                                            'Escape'
                                                        )
                                                            cancelRename();
                                                    }}
                                                    onBlur={() => {
                                                        // An emptied field
                                                        // keeps the old name.
                                                        if (renamingRef.current)
                                                            cancelRename();
                                                    }}
                                                >
                                                    <RecipeIngredientNameInput
                                                        value={renaming.value}
                                                        index={index}
                                                        focusInput={() => {}}
                                                        savedIngredients={
                                                            savedIngredients
                                                        }
                                                        onChange={(value) =>
                                                            updateRenaming({
                                                                index,
                                                                value,
                                                            })
                                                        }
                                                        onCommit={(
                                                            value,
                                                            selected,
                                                        ) =>
                                                            commitRename(
                                                                value,
                                                                selected,
                                                            )
                                                        }
                                                        onOpenSheet={() => {}}
                                                    />
                                                </div>
                                            )
                                        }
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
                                            // On to the next ingredient's name.
                                            onEnter: openComposer,
                                            onFocus: (input) => {
                                                // Typing replaces the weight.
                                                input.select();
                                                revealAboveKeyboard(input, 24);
                                            },
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
                                    onWeightClick={
                                        disabled
                                            ? undefined
                                            : () => editWeight(index)
                                    }
                                    nutritionLookingUp={nutritionLookingUpNames.has(
                                        normalizeIngredientName(
                                            ingredient.name,
                                        ),
                                    )}
                                    onNutritionResolved={(nutrition) =>
                                        resolveSheetNutrition(index, nutrition)
                                    }
                                    onSaveNutrition={(
                                        corrected,
                                        saveToUserIngredients,
                                    ) =>
                                        saveSheetNutrition(
                                            index,
                                            corrected,
                                            saveToUserIngredients,
                                        )
                                    }
                                    onRenameNutrition={(
                                        renamed,
                                        saveToUserIngredients,
                                    ) =>
                                        saveSheetNutrition(
                                            index,
                                            renamed,
                                            saveToUserIngredients,
                                            true,
                                        )
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
                                    enterKeyHint={
                                        ingredientName.trim() ? 'next' : 'done'
                                    }
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
                                    onClick={closeComposer}
                                >
                                    <CloseIcon />
                                </button>
                            </div>
                        )}
                    </>
                )}
                {/* A small ＋ where the next ingredient will appear, in the
                    thumbnail column: easy to reach, hard to hit by mistake.
                    Outside edit mode it starts editing with the name field
                    open. Out of the way while typing, so a tap near the
                    keyboard cannot start another ingredient. */}
                {!keyboardUp && (
                    <div className="journal-add-ingredient-row">
                        <button
                            type="button"
                            className="journal-add-ingredient"
                            aria-label={
                                editing
                                    ? 'Add ingredient'
                                    : `Add ingredient to ${entry.mealName}`
                            }
                            title="Add ingredient"
                            disabled={saving || disabled}
                            onClick={editing ? openComposer : addFromView}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 6v12M6 12h12" />
                            </svg>
                        </button>
                    </div>
                )}
            </IngredientSection>
            {/* A new meal has nothing to total yet, and while typing the
                total steps aside; it returns, updated, with the keyboard. */}
            {ingredients.length > 0 && !keyboardUp && (
                <div
                    className="journal-meal-total"
                    role="group"
                    aria-label="Meal total"
                >
                    {knownIngredients.length ? (
                        <>
                            <span className="journal-meal-total-line">
                                <strong>Total:</strong>{' '}
                                {amount(totals.calories)}
                                {' kcal · '}
                                {amount(totals.protein)}
                                {' g protein · '}
                                {amount(totals.carbohydrate)}
                                {' g carbs · '}
                                {amount(totals.fat)} g fat
                            </span>
                            {incompleteNutrition && (
                                <small>
                                    Based on ingredients with available
                                    nutrition data
                                </small>
                            )}
                        </>
                    ) : (
                        'Nutrition unavailable for some ingredients.'
                    )}
                </div>
            )}
            {/* Outside the card, so Undo still works if the meal collapses. */}
            {discardUndo.undoToast &&
                createPortal(discardUndo.undoToast, document.body)}
        </div>
    );
}
