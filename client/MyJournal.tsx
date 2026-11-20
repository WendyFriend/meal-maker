import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from 'react';
import type { HeaderEditActions } from './navigation/PageHeader';
import type { JournalEntry, JournalEntryInput } from '../shared/types/journal';
import type { MealIngredient, UserIngredient } from '../shared/types/types';
import LoadingSpinner from './components/LoadingSpinner';
import CollectionContextMenu from './components/CollectionContextMenu';
import { contextMenuPosition } from './components/contextMenuPosition';
import SwipeableCollectionRow from './components/SwipeableCollectionRow';
import MealMicronutrients from './meal-generator/components/MealMicronutrients';
import NutritionOverview from './meal-generator/components/NutritionOverview';
import { localDateValue } from './journal/nutrition';
import { subscribeJournalChanges } from './journal/changes';
import PlanCalendar from './journal/PlanCalendar';
import JournalMealIngredients from './journal/JournalMealIngredients';
import { combineFoods } from './journal/foodList';
import IngredientSectionRow from './components/IngredientSectionRow';
import {
    calorieScale,
    hasUnavailableNutrition,
    knownNutritionIngredients,
    totalFiber,
    totalNutrition,
} from './utils/nutrition';
import {
    deleteJournalEntry,
    getJournalEntries,
    reorderJournalEntries,
    saveJournalEntry,
    updateJournalEntryIngredients,
    updateJournalEntryName,
} from './services/journalService';
import { MissingJournalEntryError } from './services/journalErrors';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useUndoableDelete } from './hooks/useUndoableDelete';
import { useUndoToast } from './hooks/useUndoToast';
import { useLongPressReorder } from './hooks/useLongPressReorder';
import ActionToast from './components/ActionToast';
import { successToastColors } from './components/actionToastColors';
import AddMealSheet from './journal/AddMealSheet';
import MealNameField from './journal/MealNameField';
import { defaultMealName, nextPlanTime } from './journal/planMeal';
import type { Recipe } from '../shared/types/recipe';
import './components/SavedCollection.css';
import './MyJournal.css';

function displayDay(day: string) {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function shiftDay(day: string, offset: number) {
    const [year, month, date] = day.split('-').map(Number);
    return localDateValue(new Date(year, month - 1, date + offset));
}

function macroPercentages(ingredients: JournalEntry['ingredients']) {
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

/** Move Up, Move Down and Delete, with a separator. */
/** A meal menu's height: 44px items plus Delete's divider. */
function mealMenuHeight(items: number) {
    return items * 44 + 19;
}

/** Surfaces opened from a meal (sheets, popups, menus, toasts). */
const MEAL_OVERLAYS =
    'dialog, [popover], [role="dialog"], [role="menu"], [role="listbox"], .action-toast';

/** A meal created in place at the end of the list, not yet saved. */
type NewMeal = {
    entry: JournalEntry;
    day: string;
    initialDraft: MealIngredient[];
};

/** "Meal N" over the name. */
function MealLabelText({
    number,
    name,
    placeholder = false,
    nameEditor,
}: {
    number: number;
    name: string;
    /** A new meal's name until saving names it. */
    placeholder?: boolean;
    /** Shown in the name's place while renaming. */
    nameEditor?: ReactNode;
}) {
    return (
        <>
            <small>Meal {number}</small>
            {nameEditor ?? (
                <strong
                    className={
                        placeholder
                            ? 'journal-meal-name-placeholder'
                            : undefined
                    }
                >
                    {name}
                </strong>
            )}
        </>
    );
}

export default function MyJournal({
    isActive = true,
    savedIngredients = [],
    onOpenMeal,
    onEditActionsChange,
}: {
    isActive?: boolean;
    savedIngredients?: UserIngredient[];
    /** Opens the meal as a recipe page. */
    onOpenMeal?: (entry: JournalEntry) => void;
    /**
     * Shows a meal edit's ✕ / ✓ in the app header (null when it ends).
     * Without it, they stay in the meal's own row.
     */
    onEditActionsChange?: (actions: HeaderEditActions | null) => void;
}) {
    const [day, setDay] = useState(() => localDateValue());
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [view, setView] = useState<'meals' | 'foods' | 'nutrients'>('meals');
    const [expandedEntryIds, setExpandedEntryIds] = useState<string[]>([]);
    // Meals whose ingredients are being edited show a calmer header.
    const [editingEntryIds, setEditingEntryIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    // The meal whose ✕ / ✓ are in the app header; another meal ending its
    // edit (e.g. saved on leave as this one starts) never clears them.
    const headerEditOwner = useRef<string | null>(null);
    const onEditActionsChangeRef = useRef(onEditActionsChange);
    useLayoutEffect(() => {
        onEditActionsChangeRef.current = onEditActionsChange;
    });
    const setHeaderEditActions = useCallback(
        (
            id: string,
            isNew: boolean,
            actions: {
                saving: boolean;
                onCancel: () => void;
                onSave: () => void;
            } | null,
        ) => {
            if (!actions) {
                if (headerEditOwner.current !== id) return;
                headerEditOwner.current = null;
                onEditActionsChangeRef.current?.(null);
                return;
            }
            headerEditOwner.current = id;
            onEditActionsChangeRef.current?.({
                ...actions,
                title: isNew ? 'New Meal' : 'Edit Meal',
                cancelLabel: 'Cancel ingredients changes',
                saveLabel: 'Save ingredients changes',
                savingLabel: 'Saving ingredients changes',
            });
        },
        [],
    );
    // Moving to another tab hands the header back.
    useEffect(() => {
        if (isActive || !headerEditOwner.current) return;
        headerEditOwner.current = null;
        onEditActionsChangeRef.current?.(null);
    }, [isActive]);
    const setEntryEditing = useCallback((id: string, editing: boolean) => {
        setEditingEntryIds((current) => {
            if (current.has(id) === editing) return current;
            const next = new Set(current);
            if (editing) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);
    const [actionSlots, setActionSlots] = useState<
        Record<string, HTMLDivElement | null>
    >({});
    // Stable per-meal ref callbacks; a fresh callback each render would
    // detach and reattach the slot, updating state in a loop.
    const [actionSlotRefs] = useState(
        () => new Map<string, (node: HTMLDivElement | null) => void>(),
    );
    function actionSlotRef(id: string) {
        let ref = actionSlotRefs.get(id);
        if (!ref) {
            ref = (node) =>
                setActionSlots((current) =>
                    current[id] === node ? current : { ...current, [id]: node },
                );
            actionSlotRefs.set(id, ref);
        }
        return ref;
    }
    const [orderError, setOrderError] = useState('');
    const [addingMeal, setAddingMeal] = useState(false);
    const [mealAdded, setMealAdded] = useState(0);
    const [newMeal, setNewMeal] = useState<NewMeal | null>(null);
    // A created meal keeps its new-meal row key, so the card (and its save
    // spinner and nutrition follow-up) stays mounted when it is replaced.
    const [rowKeys, setRowKeys] = useState<Record<string, string>>({});
    const rowKey = (id: string) => rowKeys[id] ?? id;
    // Meals saved in place of a row with no database record (a new meal's
    // key, or a meal deleted on another device), by that row's id.
    const replacements = useRef(new Map<string, Promise<JournalEntry>>());
    const discardToast = useUndoToast();
    const journalChangeSource = useRef(Symbol('my-journal'));
    const lastPointerType = useRef('mouse');
    // Where a long press on a meal's ingredients started (null on its row).
    const pressPoint = useRef<{ x: number; y: number } | null>(null);
    const mealListRef = useRef<HTMLOListElement>(null);
    const [result, setResult] = useState<{
        day: string;
        entries: JournalEntry[];
        error?: string;
    }>();
    // Swipe or right-click to remove. The meal hides at once and is only
    // deleted when the Undo toast expires, so Undo needs no re-insert.
    const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
    const [mealMenu, setMealMenu] = useState<{
        entry: JournalEntry;
        x: number;
        y: number;
        trigger: HTMLElement | null;
        /** Opened by a touch hold: drag reorders, so no Move Up/Down. */
        touch: boolean;
    } | null>(null);
    const closeMealMenu = useCallback(() => setMealMenu(null), []);
    // Bumped by the menu's Edit; the meal starts editing when it changes.
    const [editRequests, setEditRequests] = useState<Record<string, number>>(
        {},
    );
    const [removeError, setRemoveError] = useState('');
    // A meal's name changed while editing it (by row key): part of the edit,
    // so ✓ or leaving saves it with the ingredients and ✕ drops it.
    const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
    const nameDraftsRef = useRef(nameDrafts);
    const setNameDraft = useCallback((key: string, name?: string) => {
        const next = { ...nameDraftsRef.current };
        if (name === undefined) delete next[key];
        else next[key] = name;
        nameDraftsRef.current = next;
        setNameDrafts(next);
    }, []);
    // The meal whose name field is open, and its name when it opened (Esc).
    const [renamingKey, setRenamingKey] = useState<string | null>(null);
    const renamingKeyRef = useRef(renamingKey);
    const renameOrigin = useRef('');
    const openRename = useCallback((key: string | null) => {
        renamingKeyRef.current = key;
        setRenamingKey(key);
    }, []);
    const {
        rowRef,
        exitClass,
        exitStyle,
        hiddenIds,
        remove,
        finish: finishRemoval,
        undoToast,
    } = useUndoableDelete<HTMLLIElement>({
        isActive,
        onHidden: () => setOpenSwipeId(null),
        commit: async (ids) => {
            const removed = new Set<string>();
            await Promise.all(
                ids.map((id) =>
                    deleteJournalEntry(id, journalChangeSource.current).then(
                        () => removed.add(id),
                        () =>
                            setRemoveError('Could not remove meal. Try again.'),
                    ),
                ),
            );
            setResult((previous) =>
                previous
                    ? {
                          ...previous,
                          entries: previous.entries.filter(
                              (entry) => !removed.has(entry.id),
                          ),
                      }
                    : previous,
            );
        },
    });
    const mealsTabRef = useRef<HTMLButtonElement>(null);
    const foodsTabRef = useRef<HTMLButtonElement>(null);
    const nutrientsTabRef = useRef<HTMLButtonElement>(null);
    const [refreshing, setRefreshing] = useState(false);
    const refreshingRef = useRef(false);
    const requestIdRef = useRef(0);
    const staleWhileHidden = useRef(false);
    const [refreshError, setRefreshError] = useState('');
    useEffect(
        () =>
            subscribeJournalChanges((source) => {
                if (source === journalChangeSource.current) return;
                if (isActive) setAttempt((value) => value + 1);
                else staleWhileHidden.current = true;
            }),
        [isActive],
    );
    useEffect(() => {
        if (isActive && staleWhileHidden.current) {
            staleWhileHidden.current = false;
            setAttempt((value) => value + 1);
        }
    }, [isActive]);
    useEffect(() => {
        if (!isActive) return;
        return () => {
            setCalendarOpen(false);
            setOpenSwipeId(null);
            setMealMenu(null);
        };
    }, [isActive]);
    useEffect(() => {
        let active = true;
        const requestId = ++requestIdRef.current;
        getJournalEntries(day)
            .then((entries) => {
                if (active && requestId === requestIdRef.current) {
                    setResult({ day, entries });
                    setRefreshError('');
                }
            })
            .catch(() => {
                if (!active || requestId !== requestIdRef.current) return;
                if (refreshingRef.current)
                    setRefreshError('Could not refresh your diary.');
                else
                    setResult({
                        day,
                        entries: [],
                        error: 'Could not load your diary. Please try again.',
                    });
            })
            .finally(() => {
                if (active && requestId === requestIdRef.current) {
                    refreshingRef.current = false;
                    setRefreshing(false);
                }
            });
        return () => {
            active = false;
        };
    }, [day, attempt]);
    const current = result?.day === day ? result : undefined;
    const entries = (current?.entries ?? []).filter(
        (entry) => !hiddenIds.has(entry.id),
    );
    const shownNewMeal =
        current && !current.error && newMeal?.day === day ? newMeal : null;
    // The new meal is listed last but is not part of the day's totals or
    // order until it is saved.
    const listedMeals = shownNewMeal
        ? [...entries, shownNewMeal.entry]
        : entries;
    function openAddMeal() {
        setOpenSwipeId(null);
        setAddingMeal(true);
    }
    // Long press lifts a meal; dropping it saves the new order straight away.
    const { liftedId, pressProps, projectedIndex, holdNow } =
        useLongPressReorder({
            listRef: mealListRef,
            // A lone meal still opens its menu on a long press.
            enabled: isActive && view === 'meals' && entries.length > 0,
            // Held and let go without dragging: the meal's menu, as on iOS.
            onHold: (id) => {
                const entry = entries.find((item) => item.id === id);
                const row = mealListRef.current?.querySelector<HTMLElement>(
                    `[data-reorder-id="${CSS.escape(id)}"] .journal-meal-row`,
                );
                if (!entry || !row) return;
                const bounds = row.getBoundingClientRect();
                const touch = lastPointerType.current === 'touch';
                // Held on the ingredients: the menu opens where the finger
                // was, not at the (possibly far away) title.
                const point = pressPoint.current;
                setOpenSwipeId(null);
                setMealMenu({
                    entry,
                    touch,
                    trigger:
                        row.querySelector<HTMLElement>(
                            '.journal-meal-toggle',
                        ) ?? row,
                    ...contextMenuPosition(
                        point?.x ?? bounds.left + 16,
                        point?.y ?? bounds.bottom,
                        mealMenuHeight(
                            mealMenuActions(entry, touch).length + 1,
                        ),
                    ),
                });
            },
            onLift: () => {
                // The saved order must list every meal, so settle any removal.
                finishRemoval();
                setOpenSwipeId(null);
                setMealMenu(null);
            },
            onReorder: (id, to) => {
                const ids = entries.map((entry) => entry.id);
                ids.splice(ids.indexOf(id), 1);
                ids.splice(to, 0, id);
                saveMealOrder(ids);
            },
        });
    const refresh = () => {
        if (!current || current.error || refreshingRef.current || liftedId)
            return;
        refreshingRef.current = true;
        requestIdRef.current++;
        setRefreshing(true);
        setRefreshError('');
        setAttempt((value) => value + 1);
    };
    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive,
        disabled: !current || Boolean(current.error) || Boolean(liftedId),
        refreshing,
        onRefresh: refresh,
    });
    const ingredients = entries.flatMap((entry) => entry.ingredients);
    const dailyKnownIngredients = knownNutritionIngredients(ingredients);
    const dailyTotals = totalNutrition(dailyKnownIngredients);
    const dailyNutritionIncomplete = hasUnavailableNutrition(ingredients);
    const dailyNutritionPartial =
        dailyNutritionIncomplete && dailyKnownIngredients.length > 0;
    const dailyFiber = totalFiber(ingredients);
    // Food List: each food once, with the day's portions added up.
    const foods = combineFoods(ingredients);
    const foodCalorieScale = calorieScale(foods);
    const dailyFiberForSummary =
        ingredients.length === 0
            ? { ...dailyFiber, available: true, hasKnown: true }
            : dailyFiber;

    function selectDay(nextDay: string) {
        if (!nextDay || liftedId) return;
        refreshingRef.current = false;
        requestIdRef.current++;
        setRefreshing(false);
        setRefreshError('');
        setExpandedEntryIds([]);
        setOrderError('');
        setOpenSwipeId(null);
        // Unmounting the new meal saves it (or drops it if empty).
        setNewMeal(null);
        setDay(nextDay);
    }

    function toggleEntry(id: string) {
        setExpandedEntryIds((current) =>
            current.includes(id)
                ? current.filter((entryId) => entryId !== id)
                : [...current, id],
        );
    }

    /** Shows a saved meal in place of `replacesId`, or last if new. */
    function showEntry(
        saved: JournalEntry,
        day: string,
        replacesId = saved.id,
    ) {
        setResult((value) =>
            value?.day === day
                ? {
                      ...value,
                      entries: value.entries.some(
                          (item) => item.id === replacesId,
                      )
                          ? value.entries.map((item) =>
                                item.id === replacesId ? saved : item,
                            )
                          : [...value.entries, saved],
                  }
                : value,
        );
    }

    /**
     * Creates `input` as the meal shown in place of `replacesId`, keeping its
     * card (row key) so it stays mounted; later saves for that id go to it.
     */
    async function saveInPlace(
        replacesId: string,
        input: JournalEntryInput,
        day: string,
    ) {
        const request = saveJournalEntry(input, journalChangeSource.current);
        replacements.current.set(replacesId, request);
        try {
            const saved = await request;
            setRowKeys((keys) => ({
                ...keys,
                [saved.id]: keys[replacesId] ?? replacesId,
            }));
            showEntry(saved, day, replacesId);
            setNewMeal((meal) => (meal?.entry.id === replacesId ? null : meal));
            return saved;
        } catch (error) {
            replacements.current.delete(replacesId);
            throw error;
        }
    }

    async function saveMealIngredients(
        entry: JournalEntry,
        ingredients: MealIngredient[],
    ): Promise<JournalEntry> {
        const replacement = replacements.current.get(entry.id);
        if (replacement)
            return saveMealIngredients(await replacement, ingredients);
        try {
            const saved = await updateJournalEntryIngredients(
                entry.id,
                ingredients,
                journalChangeSource.current,
            );
            showEntry(saved, day);
            return saved;
        } catch (error) {
            if (!(error instanceof MissingJournalEntryError)) throw error;
            // Deleted on another device while being edited here: keep the
            // edit by saving it as the same meal again, in the same card.
            if (replacements.current.has(entry.id))
                return saveMealIngredients(entry, ingredients);
            const { eatenAt, mealName } = entry;
            return saveInPlace(
                entry.id,
                { eatenAt, mealName, ingredients },
                day,
            );
        }
    }

    /** "Create a new one": an empty meal card, open for ingredients. */
    function startNewMeal() {
        setAddingMeal(false);
        setOpenSwipeId(null);
        discardToast.dismiss();
        const key = `new-meal-${Date.now()}`;
        setExpandedEntryIds((ids) => [...ids, key]);
        setNewMeal({
            day,
            initialDraft: [],
            entry: {
                id: key,
                eatenAt: nextPlanTime(day, current?.entries ?? []),
                mealName: 'New meal',
                ingredients: [],
            },
        });
    }

    /**
     * The first save creates the meal, named as typed or from its day and
     * first ingredient; later saves (nutrition filled in afterwards) update it.
     */
    function saveNewMeal(
        meal: NewMeal,
        ingredients: MealIngredient[],
        name?: string,
    ) {
        const { id, eatenAt } = meal.entry;
        if (replacements.current.has(id))
            return saveMealIngredients(meal.entry, ingredients);
        const mealName = name ?? defaultMealName(meal.day, ingredients);
        return saveInPlace(id, { eatenAt, mealName, ingredients }, meal.day);
    }

    function discardNewMeal(meal: NewMeal, draft: MealIngredient[]) {
        setNewMeal(null);
        if (!draft.length) return;
        discardToast.show('Meal discarded.', () =>
            setNewMeal({ ...meal, initialDraft: draft }),
        );
    }

    function removeMeal(entry: JournalEntry) {
        setMealMenu(null);
        setRemoveError('');
        remove([entry.id], 'Meal removed.');
    }

    /** Shows the new order at once and saves it in the background. */
    function saveMealOrder(orderedIds: string[]) {
        const previous = current?.entries;
        if (!previous) return;
        const byId = new Map(previous.map((entry) => [entry.id, entry]));
        const reordered = [
            ...orderedIds.flatMap((id) => byId.get(id) ?? []),
            ...previous.filter((entry) => !orderedIds.includes(entry.id)),
        ].map((entry, index) => ({ ...entry, planPosition: index + 1 }));
        const showOrder = (next: JournalEntry[]) =>
            setResult((value) =>
                value?.day === day ? { ...value, entries: next } : value,
            );
        showOrder(reordered);
        setOrderError('');
        reorderJournalEntries(day, orderedIds).catch(() => {
            showOrder(previous);
            setOrderError('Could not save meal order. Try again.');
        });
    }

    /** Copies a saved recipe into this day's plan as its last meal. */
    async function addRecipeToPlan(recipe: Recipe) {
        const saved = await saveJournalEntry(
            {
                eatenAt: nextPlanTime(day, current?.entries ?? []),
                mealName: recipe.recipeName,
                ingredients: recipe.ingredients,
            },
            journalChangeSource.current,
        );
        setResult((value) =>
            value?.day === day
                ? { ...value, entries: [...value.entries, saved] }
                : value,
        );
        setAddingMeal(false);
        setMealAdded((count) => count + 1);
    }

    /** The menu's Edit: open the meal and start editing its ingredients. */
    function editMeal(entry: JournalEntry) {
        const key = rowKey(entry.id);
        setExpandedEntryIds((ids) => (ids.includes(key) ? ids : [...ids, key]));
        setEditRequests((requests) => ({
            ...requests,
            [entry.id]: (requests[entry.id] ?? 0) + 1,
        }));
    }

    /** Opens the name field of a meal being edited. */
    function startRename(key: string, name: string) {
        renameOrigin.current = name;
        setNameDraft(key, name);
        openRename(key);
    }

    /** Closes the name field; an emptied name goes back to what it was. */
    function closeRename(restore = false) {
        const key = renamingKeyRef.current;
        if (!key) return;
        openRename(null);
        const name = nameDraftsRef.current[key] ?? '';
        if (!restore && name.trim()) return;
        // A new meal's untouched name is no name: it keeps its placeholder.
        setNameDraft(key, renameOrigin.current || undefined);
    }

    /** The edited name to save with the ingredients, if it changed. */
    function editedName(key: string, current: string) {
        const name = nameDraftsRef.current[key]?.trim();
        return name && name !== current ? name : undefined;
    }

    /** Ends a meal's edit: its name draft goes with it. */
    function endNameEdit(key: string) {
        if (renamingKeyRef.current === key) openRename(null);
        if (key in nameDraftsRef.current) setNameDraft(key);
    }

    async function saveMeal(
        entry: JournalEntry,
        key: string,
        ingredients: MealIngredient[],
    ) {
        const name = editedName(key, entry.mealName);
        const saved = await saveMealIngredients(entry, ingredients);
        if (!name || name === saved.mealName) return saved;
        const renamed = await updateJournalEntryName(
            saved.id,
            name,
            journalChangeSource.current,
        );
        showEntry(renamed, day);
        return renamed;
    }

    /**
     * Right-click (or the menu key) on a meal opens its menu where clicked.
     * A touch long press lifts the meal and shows the menu when let go
     * (onHold); Android's own long press can arrive first, so it lifts now.
     */
    function openMealContextMenu(
        event: ReactMouseEvent<HTMLElement>,
        entry: JournalEntry,
        editingMeal: boolean,
    ) {
        event.preventDefault();
        if (lastPointerType.current === 'touch') {
            if (!editingMeal) holdNow();
            return;
        }
        pressProps(entry.id).onPointerUp();
        if (liftedId) return;
        const card =
            event.currentTarget.closest<HTMLElement>('.journal-meal-card');
        const trigger =
            card?.querySelector<HTMLElement>('.journal-meal-toggle') ??
            event.currentTarget;
        const bounds = event.currentTarget.getBoundingClientRect();
        setOpenSwipeId(null);
        setMealMenu({
            entry,
            touch: false,
            trigger,
            ...contextMenuPosition(
                event.clientX || bounds.left + 16,
                event.clientY || bounds.bottom,
                mealMenuHeight(mealMenuActions(entry, false).length + 1),
            ),
        });
    }

    /**
     * The long press and right-click of a meal's ingredients area. Sheets and
     * popups opened from it are rendered elsewhere but their events still
     * bubble here through React, so those are left alone.
     */
    function contentPressProps(
        entry: JournalEntry,
        press: ReturnType<typeof pressProps>,
    ) {
        const fromMeal = (event: ReactMouseEvent<HTMLElement>) =>
            event.target instanceof Element &&
            event.currentTarget.contains(event.target) &&
            !event.target.closest(MEAL_OVERLAYS);
        return {
            ...press,
            onPointerDown(event: ReactPointerEvent<HTMLElement>) {
                if (!fromMeal(event)) return;
                lastPointerType.current = event.pointerType;
                pressPoint.current = { x: event.clientX, y: event.clientY };
                press.onPointerDown(event);
            },
            onContextMenu(event: ReactMouseEvent<HTMLElement>) {
                if (fromMeal(event)) openMealContextMenu(event, entry, false);
            },
        };
    }

    /**
     * The meal's menu: View Details (its meal page) and Edit, then Move Up /
     * Down for mouse and keyboard only; on touch, hold and drag reorders.
     * Delete follows on its own.
     */
    function mealMenuActions(entry: JournalEntry, touch: boolean) {
        return [
            ...(onOpenMeal
                ? [
                      {
                          label: 'View Details',
                          icon: (
                              // The Recipes tab's book, as the meal page
                              // shares Recipe Detail's layout.
                              <path d="M12 5c-2.5-1.8-5.7-2-9-1v16c3.3-1 6.5-.8 9 1 2.5-1.8 5.7-2 9-1V4c-3.3-1-6.5-.8-9 1Zm0 0v16" />
                          ),
                          onSelect: () => onOpenMeal(entry),
                      },
                  ]
                : []),
            {
                label: 'Edit',
                icon: (
                    <>
                        <path d="M4 20h4l11-11a2.1 2.1 0 0 0-4-4L4 16v4Z" />
                        <path d="m13.7 6.3 4 4" />
                    </>
                ),
                onSelect: () => editMeal(entry),
            },
            ...(touch ? [] : mealMoveActions(entry.id)),
        ];
    }

    function mealMoveActions(id: string) {
        const index = entries.findIndex((entry) => entry.id === id);
        return [
            index > 0 && {
                label: 'Move Up',
                icon: <path d="M12 19V5m-6 6 6-6 6 6" />,
                onSelect: () => moveMeal(id, -1),
            },
            index >= 0 &&
                index < entries.length - 1 && {
                    label: 'Move Down',
                    icon: <path d="M12 5v14m-6-6 6 6 6-6" />,
                    onSelect: () => moveMeal(id, 1),
                },
        ].filter((action) => action !== false);
    }

    function moveMeal(id: string, offset: number) {
        const ids = entries.map((entry) => entry.id);
        const index = ids.indexOf(id);
        const destination = index + offset;
        if (index < 0 || destination < 0 || destination >= ids.length) return;
        finishRemoval();
        [ids[index], ids[destination]] = [ids[destination], ids[index]];
        saveMealOrder(ids);
    }

    return (
        <section
            ref={containerRef}
            className={`my-journal saved-collection${isActive ? ' pull-refresh-active' : ''}`}
            aria-labelledby="my-journal-heading"
            hidden={!isActive}
            inert={!isActive}
        >
            <PullRefreshIndicator
                distance={pullDistance}
                refreshing={refreshing}
                label="Refreshing My Diary"
            />
            <header className="saved-collection-intro">
                <div className="saved-collection-title journal-title-row">
                    <h1 id="my-journal-heading">My Diary</h1>
                    {/* Like Calendar and Reminders, adding lives in the title
                        bar: always in the same place, never hidden while a
                        meal is edited, and away from the meals. Tapping it
                        mid-edit saves that edit first (save on leave). */}
                    <button
                        type="button"
                        className="journal-add-meal-button"
                        aria-label="Add meal"
                        title="Add meal"
                        disabled={
                            !current ||
                            Boolean(current.error) ||
                            Boolean(shownNewMeal) ||
                            Boolean(liftedId)
                        }
                        onClick={openAddMeal}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 4.5v15M4.5 12h15" />
                        </svg>
                    </button>
                </div>
                <div className="journal-date-row">
                    <button
                        type="button"
                        aria-label="Previous day"
                        disabled={Boolean(liftedId)}
                        onClick={() => selectDay(shiftDay(day, -1))}
                    >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m14 6-6 6 6 6" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        className="journal-date"
                        aria-label="Choose diary date"
                        aria-haspopup="dialog"
                        aria-expanded={calendarOpen}
                        disabled={Boolean(liftedId)}
                        onClick={() => setCalendarOpen(true)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="3" y="5" width="18" height="16" rx="2" />
                            <path d="M7 3v4m10-4v4M3 10h18" />
                        </svg>
                        <span>
                            {day === localDateValue()
                                ? `Today, ${displayDay(day).replace(/ \d{4}$/, '')}`
                                : displayDay(day)}
                        </span>
                    </button>
                    <button
                        type="button"
                        aria-label="Next day"
                        disabled={Boolean(liftedId)}
                        onClick={() => selectDay(shiftDay(day, 1))}
                    >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="m10 6 6 6-6 6" />
                        </svg>
                    </button>
                </div>
            </header>
            {isActive && calendarOpen && (
                <PlanCalendar
                    selectedDay={day}
                    onClose={() => setCalendarOpen(false)}
                    onSelect={(selectedDay) => {
                        selectDay(selectedDay);
                        setCalendarOpen(false);
                    }}
                />
            )}
            {refreshError && (
                <div className="saved-collection-refresh-error" role="alert">
                    <span>{refreshError}</span>
                    <button type="button" onClick={refresh}>
                        Try again
                    </button>
                </div>
            )}
            {!current ? (
                <div className="journal-loading" role="status">
                    <LoadingSpinner />
                    Loading your diary…
                </div>
            ) : current.error ? (
                <div className="journal-error" role="alert">
                    <p>{current.error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setResult(undefined);
                            setAttempt((value) => value + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <NutritionOverview
                        ariaLabel="Daily nutrition summary"
                        className="journal-day-summary-overview"
                        nutrition={dailyTotals}
                        fiber={dailyFiberForSummary}
                        percentages={macroPercentages(dailyKnownIngredients)}
                        incomplete={dailyNutritionIncomplete}
                        partial={dailyNutritionPartial}
                    />
                    <div
                        className="journal-view-tabs"
                        role="tablist"
                        aria-label="Diary views"
                        onKeyDown={(event) => {
                            const views = [
                                'meals',
                                'foods',
                                'nutrients',
                            ] as const;
                            const currentIndex = views.indexOf(view);
                            const next =
                                event.key === 'ArrowRight'
                                    ? views[(currentIndex + 1) % views.length]
                                    : event.key === 'ArrowLeft'
                                      ? views[
                                            (currentIndex + views.length - 1) %
                                                views.length
                                        ]
                                      : event.key === 'End'
                                        ? 'nutrients'
                                        : event.key === 'Home'
                                          ? 'meals'
                                          : null;
                            if (!next) return;
                            event.preventDefault();
                            setView(next);
                            ({
                                meals: mealsTabRef,
                                foods: foodsTabRef,
                                nutrients: nutrientsTabRef,
                            })[next].current?.focus();
                        }}
                    >
                        <button
                            ref={mealsTabRef}
                            type="button"
                            role="tab"
                            id="journal-meals-tab"
                            aria-controls="journal-meals-panel"
                            aria-selected={view === 'meals'}
                            tabIndex={view === 'meals' ? 0 : -1}
                            onClick={() => setView('meals')}
                        >
                            Meals
                        </button>
                        <button
                            ref={foodsTabRef}
                            type="button"
                            role="tab"
                            id="journal-foods-tab"
                            aria-controls="journal-foods-panel"
                            aria-selected={view === 'foods'}
                            tabIndex={view === 'foods' ? 0 : -1}
                            onClick={() => setView('foods')}
                        >
                            Food List
                        </button>
                        <button
                            ref={nutrientsTabRef}
                            type="button"
                            role="tab"
                            id="journal-nutrients-tab"
                            aria-controls="journal-nutrients-panel"
                            aria-selected={view === 'nutrients'}
                            tabIndex={view === 'nutrients' ? 0 : -1}
                            onClick={() => setView('nutrients')}
                        >
                            Key nutrients
                        </button>
                    </div>
                    <div
                        id="journal-meals-panel"
                        role="tabpanel"
                        aria-labelledby="journal-meals-tab"
                        hidden={view !== 'meals'}
                    >
                        {(orderError || removeError) && (
                            <p className="journal-order-error" role="alert">
                                {orderError || removeError}
                            </p>
                        )}
                        {listedMeals.length ? (
                            <ol
                                ref={mealListRef}
                                className={`journal-meals${liftedId ? ' journal-meals-dragging' : ''}`}
                            >
                                {listedMeals.map((entry, index) => {
                                    const isNew = entry === shownNewMeal?.entry;
                                    const key = rowKey(entry.id);
                                    const expanded =
                                        expandedEntryIds.includes(key);
                                    // A new meal opens in edit mode; no frame shows the
                                    // usual header before its editor reports in.
                                    const editingMeal =
                                        isNew || editingEntryIds.has(key);
                                    const mealNumber =
                                        projectedIndex(index) + 1;
                                    const press = pressProps(entry.id);
                                    const renamingMeal = renamingKey === key;
                                    const shownName =
                                        editingMeal && key in nameDrafts
                                            ? nameDrafts[key]
                                            : entry.mealName;
                                    return (
                                        <li
                                            className={`journal-meal-card${liftedId === entry.id ? ' journal-meal-dragging' : ''}${exitClass(entry.id)}`}
                                            ref={
                                                isNew
                                                    ? undefined
                                                    : rowRef(entry.id)
                                            }
                                            data-expanded={expanded}
                                            data-menu-open={
                                                mealMenu?.entry.id ===
                                                    entry.id || undefined
                                            }
                                            data-reorder-id={
                                                isNew ? undefined : entry.id
                                            }
                                            style={exitStyle(entry.id)}
                                            key={key}
                                        >
                                            <SwipeableCollectionRow
                                                name={entry.mealName}
                                                enabled={!liftedId && !isNew}
                                                open={openSwipeId === entry.id}
                                                onOpen={() =>
                                                    setOpenSwipeId(entry.id)
                                                }
                                                onClose={() =>
                                                    setOpenSwipeId((id) =>
                                                        id === entry.id
                                                            ? null
                                                            : id,
                                                    )
                                                }
                                                onDelete={() =>
                                                    removeMeal(entry)
                                                }
                                            >
                                                {/* Long press, right-click and Alt+Arrow work anywhere on
                                                    the row. A collapsed meal expands from anywhere; once
                                                    expanded, the name (with its chevron) opens the meal
                                                    page and the trailing chevron collapses it. */}
                                                <div
                                                    className={`journal-meal-row${editingMeal ? ' journal-meal-row-editing' : ''}`}
                                                    // Editing pauses reordering, so a long press
                                                    // near ✕ / ✓ never lifts the meal.
                                                    {...(editingMeal
                                                        ? {}
                                                        : press)}
                                                    onPointerDown={(event) => {
                                                        lastPointerType.current =
                                                            event.pointerType;
                                                        pressPoint.current =
                                                            null;
                                                        if (!editingMeal)
                                                            press.onPointerDown(
                                                                event,
                                                            );
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (!event.altKey)
                                                            return;
                                                        const offset =
                                                            event.key ===
                                                            'ArrowUp'
                                                                ? -1
                                                                : event.key ===
                                                                    'ArrowDown'
                                                                  ? 1
                                                                  : 0;
                                                        if (!offset) return;
                                                        event.preventDefault();
                                                        moveMeal(
                                                            entry.id,
                                                            offset,
                                                        );
                                                    }}
                                                    onContextMenu={(event) => {
                                                        // Leave the open edit actions their own menu.
                                                        if (
                                                            isNew ||
                                                            (
                                                                event.target as HTMLElement
                                                            ).closest(
                                                                '.journal-meal-ingredient-actions',
                                                            )
                                                        )
                                                            return;
                                                        openMealContextMenu(
                                                            event,
                                                            entry,
                                                            editingMeal,
                                                        );
                                                    }}
                                                >
                                                    {/* No collapse while editing: leaving saves,
                                                        and ✓ takes this column. */}
                                                    {!editingMeal && (
                                                        <button
                                                            type="button"
                                                            className="journal-meal-toggle"
                                                            aria-label={`Meal ${mealNumber}, ${entry.mealName}`}
                                                            aria-expanded={
                                                                expanded
                                                            }
                                                            aria-controls={`journal-meal-${entry.id}`}
                                                            aria-keyshortcuts={
                                                                entries.length >
                                                                1
                                                                    ? 'Alt+ArrowUp Alt+ArrowDown'
                                                                    : undefined
                                                            }
                                                            title={
                                                                entries.length >
                                                                1
                                                                    ? 'Hold and drag to reorder'
                                                                    : undefined
                                                            }
                                                            onClick={() =>
                                                                toggleEntry(key)
                                                            }
                                                        >
                                                            <svg
                                                                className="journal-meal-chevron"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                aria-hidden="true"
                                                            >
                                                                <path d="m6 9 6 6 6-6" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {/* The meal page opens from the meal's
                                                        menu (View Details), so the whole row
                                                        just opens and closes the meal. */}
                                                    {/* While editing, the name is part of the edit:
                                                        tapping it renames the meal. */}
                                                    <span
                                                        className={`journal-meal-label${editingMeal ? ' journal-meal-label-editing' : ''}`}
                                                        aria-hidden={
                                                            !editingMeal
                                                        }
                                                        data-part-of-edit={
                                                            editingMeal ||
                                                            undefined
                                                        }
                                                    >
                                                        <MealLabelText
                                                            number={mealNumber}
                                                            name={shownName}
                                                            placeholder={
                                                                isNew &&
                                                                !(
                                                                    key in
                                                                    nameDrafts
                                                                )
                                                            }
                                                            nameEditor={
                                                                renamingMeal ? (
                                                                    <MealNameField
                                                                        value={
                                                                            shownName
                                                                        }
                                                                        placeholder={
                                                                            isNew
                                                                                ? entry.mealName
                                                                                : 'Meal name'
                                                                        }
                                                                        onChange={(
                                                                            name,
                                                                        ) =>
                                                                            setNameDraft(
                                                                                key,
                                                                                name,
                                                                            )
                                                                        }
                                                                        onSave={() =>
                                                                            closeRename()
                                                                        }
                                                                        onCancel={() =>
                                                                            closeRename(
                                                                                true,
                                                                            )
                                                                        }
                                                                    />
                                                                ) : editingMeal ? (
                                                                    <button
                                                                        type="button"
                                                                        className="journal-meal-name-button"
                                                                        aria-label={`Rename ${shownName}`}
                                                                        onClick={() =>
                                                                            startRename(
                                                                                key,
                                                                                isNew &&
                                                                                    !(
                                                                                        key in
                                                                                        nameDrafts
                                                                                    )
                                                                                    ? ''
                                                                                    : shownName,
                                                                            )
                                                                        }
                                                                    >
                                                                        {
                                                                            shownName
                                                                        }
                                                                    </button>
                                                                ) : undefined
                                                            }
                                                        />
                                                    </span>
                                                    <div
                                                        className="journal-meal-ingredient-actions"
                                                        ref={actionSlotRef(key)}
                                                    />
                                                </div>
                                            </SwipeableCollectionRow>
                                            <div
                                                className="journal-meal-expand"
                                                id={`journal-meal-${entry.id}`}
                                                data-open={expanded}
                                                aria-hidden={!expanded}
                                                inert={!expanded}
                                            >
                                                {/* Long press and right-click work on the
                                                    ingredients too, outside editing. */}
                                                <div
                                                    className={`journal-meal-expand-inner${editingMeal ? '' : ' journal-meal-expand-pressable'}`}
                                                    {...(editingMeal
                                                        ? {}
                                                        : contentPressProps(
                                                              entry,
                                                              press,
                                                          ))}
                                                >
                                                    <JournalMealIngredients
                                                        entry={entry}
                                                        expanded={expanded}
                                                        actionsContainer={
                                                            actionSlots[key]
                                                        }
                                                        disabled={Boolean(
                                                            liftedId,
                                                        )}
                                                        savedIngredients={
                                                            savedIngredients
                                                        }
                                                        onEditingChange={(
                                                            editing,
                                                        ) => {
                                                            setEntryEditing(
                                                                key,
                                                                editing,
                                                            );
                                                            if (!editing)
                                                                endNameEdit(
                                                                    key,
                                                                );
                                                        }}
                                                        nameChanged={
                                                            Boolean(
                                                                nameDrafts[
                                                                    key
                                                                ]?.trim(),
                                                            ) &&
                                                            nameDrafts[
                                                                key
                                                            ].trim() !==
                                                                entry.mealName
                                                        }
                                                        onDiscardName={() => {
                                                            const name =
                                                                nameDrafts[key];
                                                            return () => {
                                                                if (
                                                                    name !==
                                                                    undefined
                                                                )
                                                                    setNameDraft(
                                                                        key,
                                                                        name,
                                                                    );
                                                            };
                                                        }}
                                                        editRequest={
                                                            editRequests[
                                                                entry.id
                                                            ]
                                                        }
                                                        onHeaderActions={
                                                            onEditActionsChange
                                                                ? (actions) =>
                                                                      setHeaderEditActions(
                                                                          key,
                                                                          isNew,
                                                                          actions,
                                                                      )
                                                                : undefined
                                                        }
                                                        isNew={isNew}
                                                        initialDraft={
                                                            isNew
                                                                ? shownNewMeal?.initialDraft
                                                                : undefined
                                                        }
                                                        onDiscardNew={(draft) =>
                                                            shownNewMeal &&
                                                            discardNewMeal(
                                                                shownNewMeal,
                                                                draft,
                                                            )
                                                        }
                                                        onSave={(next) =>
                                                            isNew &&
                                                            shownNewMeal
                                                                ? saveNewMeal(
                                                                      shownNewMeal,
                                                                      next,
                                                                      editedName(
                                                                          key,
                                                                          '',
                                                                      ),
                                                                  )
                                                                : saveMeal(
                                                                      entry,
                                                                      key,
                                                                      next,
                                                                  )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <div className="saved-collection-empty journal-empty">
                                <p className="saved-collection-empty-title">
                                    No meals in your diary for this day
                                </p>
                                <p className="saved-collection-empty-hint">
                                    Tap + to add a meal from My Recipes or enter
                                    one yourself.
                                </p>
                            </div>
                        )}
                    </div>
                    <div
                        id="journal-foods-panel"
                        role="tabpanel"
                        aria-labelledby="journal-foods-tab"
                        hidden={view !== 'foods'}
                    >
                        {foods.length ? (
                            // The same rows as a recipe's Ingredients.
                            <div className="meal-ingredients journal-food-ingredients">
                                <ul
                                    className="ingredient-list"
                                    aria-label="Foods for the day"
                                >
                                    {foods.map((food, index) => (
                                        <li key={`${food.name}-${index}`}>
                                            <IngredientSectionRow
                                                ingredient={food}
                                                calorieScale={foodCalorieScale}
                                                showChevron
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="saved-collection-empty journal-empty">
                                <p className="saved-collection-empty-title">
                                    No foods in your diary for this day
                                </p>
                            </div>
                        )}
                    </div>
                    <div
                        id="journal-nutrients-panel"
                        role="tabpanel"
                        aria-labelledby="journal-nutrients-tab"
                        hidden={view !== 'nutrients'}
                    >
                        {view === 'nutrients' && (
                            <div className="journal-nutrients-card">
                                <MealMicronutrients
                                    ingredients={ingredients}
                                    scope="day"
                                />
                            </div>
                        )}
                    </div>
                </>
            )}
            {mealMenu && (
                <CollectionContextMenu
                    name={mealMenu.entry.mealName}
                    x={mealMenu.x}
                    y={mealMenu.y}
                    trigger={mealMenu.trigger}
                    actions={mealMenuActions(mealMenu.entry, mealMenu.touch)}
                    onDelete={() => removeMeal(mealMenu.entry)}
                    onClose={closeMealMenu}
                />
            )}
            {isActive && addingMeal && (
                <AddMealSheet
                    onClose={() => setAddingMeal(false)}
                    onAddRecipe={addRecipeToPlan}
                    onManual={startNewMeal}
                />
            )}
            {mealAdded > 0 && (
                <ActionToast
                    key={mealAdded}
                    message="Meal added."
                    placement="floating"
                    colors={successToastColors}
                    onClose={() => setMealAdded(0)}
                />
            )}
            {undoToast}
            {discardToast.undoToast}
        </section>
    );
}
