import {
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type FormEvent,
    type RefObject,
} from 'react';
import { MICRONUTRIENTS } from '../../../shared/micronutrients';
import { useAutoGrowTextarea } from '../../hooks/useAutoGrowTextarea';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import ActionToast from '../../components/ActionToast';
import { successToastColors } from '../../components/actionToastColors';
import IngredientCamera from '../../components/IngredientCamera';
import {
    LabelScanCamera,
    LabelScanFailed,
    LabelScanReading,
    LabelScanToast,
} from '../../components/LabelScan';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useLabelScan } from '../../hooks/useLabelScan';
import type { FoodSearchResult } from '../../services/foodSearchService';
import { identifyFoodPhoto } from '../../services/nutritionPhotoService';
import { IngredientCollectionContext } from '../../ingredients/IngredientCollectionContext';
import {
    isUserIngredient,
    normalizeIngredientName,
} from '../../utils/Ingredient';
import FoodMatchPicker from './FoodMatchPicker';
import IngredientNutritionContent from './IngredientNutritionContent';
import NutritionFixMenu, {
    NutritionFixOptions,
    type NutritionFix,
} from './NutritionFixMenu';
import NutritionSheetDialog from './NutritionSheetDialog';
import {
    applyNutritionForm,
    errorMessage,
    ingredientFromFood,
    labelFormValues,
    nutritionForm,
    type NutritionForm,
} from './nutritionForm';
import './NutritionDialog.css';

type MatchState =
    | { status: 'identifying' }
    | {
          status: 'ready';
          query: string;
          notice?: { text: string; error?: boolean };
      };

type NutritionDialogProps = {
    ingredientInfo: UserIngredient | IngredientInfo;
    onClose: () => void;
    onSave: (
        ingredient: UserIngredient | IngredientInfo,
        saveToUserIngredients: boolean,
    ) => Promise<void>;
    onNutritionResolved?: (ingredient: IngredientInfo) => void;
    editable?: boolean;
    /**
     * Lets the title be renamed in place (My Diary), optionally saving the
     * ingredient to My Ingredients under its new name.
     */
    onRename?: (
        ingredient: IngredientInfo,
        saveToUserIngredients: boolean,
    ) => Promise<void>;
    /**
     * For people without an account: shows the ☆ anyway, and a tap asks
     * them to sign up or sign in (returns true when it did).
     */
    onStarAuthRequired?: () => boolean;
};

/** Movement beyond this is a scroll or drag, not a tap. */
const TAP_SLOP = 10;

/**
 * The ingredient nutrition sheet. Its "Doesn't look right?" menu fixes a
 * wrong food match (search or photo) or wrong numbers (label scan or typing).
 */
export default function NutritionDialog({
    ingredientInfo: suppliedIngredient,
    onClose,
    onSave,
    onNutritionResolved,
    editable = true,
    onRename,
    onStarAuthRequired,
}: NutritionDialogProps) {
    // What the sheet shows: the latest lookup or save, else the caller's.
    const [committedIngredient, setCommittedIngredient] = useState<
        IngredientInfo | UserIngredient
    >();
    const ingredientInfo = committedIngredient ?? suppliedIngredient;
    const collection = useContext(IngredientCollectionContext);
    const savedIngredient =
        collection?.ingredients.find(
            (item) =>
                (isUserIngredient(ingredientInfo) &&
                    item.ingredientId === ingredientInfo.ingredientId) ||
                normalizeIngredientName(item.name) ===
                    normalizeIngredientName(ingredientInfo.name),
        ) ??
        (!collection && isUserIngredient(ingredientInfo)
            ? ingredientInfo
            : undefined);
    /** The ingredient with its My Ingredients id, so a save updates it. */
    const withSavedId = (ingredient: IngredientInfo): IngredientInfo => ({
        ...ingredient,
        ...(savedIngredient && { ingredientId: savedIngredient.ingredientId }),
    });
    const savedId =
        savedIngredient?.ingredientId ??
        (isUserIngredient(ingredientInfo)
            ? ingredientInfo.ingredientId
            : undefined);

    const formId = useId();
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState<NutritionForm>(() =>
        nutritionForm(ingredientInfo),
    );
    const [saving, setSaving] = useState(false);
    const savePending = useRef(false);
    const [error, setError] = useState<string>();
    const [camera, setCamera] = useState<'label' | 'food' | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    // Label values fill the open form for review; ✓ or closing saves them.
    // After a scan the ? stays beside the title to scan again.
    const [labelFilled, setLabelFilled] = useState(false);
    // Why a label couldn't be read, shown in place of the numbers.
    const [scanError, setScanError] = useState<string | null>(null);
    const scanOpenedEditing = useRef(false);
    const labelScan = useLabelScan({
        onFill: (nutrition) => {
            const { macros, micros } = labelFormValues(nutrition);
            setForm((current) => ({
                macros: { ...current.macros, ...macros },
                micros: { ...current.micros, ...micros },
            }));
            setLabelFilled(true);
            setToast(null);
        },
        onError: (message) => {
            // A scan that opened the form leaves nothing to review.
            if (scanOpenedEditing.current) setEditing(false);
            setScanError(message);
        },
    });
    const [match, setMatch] = useState<MatchState>();
    const [picking, setPicking] = useState(false);
    const [matchNotice, setMatchNotice] = useState<string>();
    // The title's name while it is being renamed.
    const [renaming, setRenaming] = useState<string | null>(null);
    // The ☆ fills (or empties) on tap, before the request finishes.
    const [star, setStar] = useState<'saving' | 'saved' | 'removing' | null>(
        null,
    );
    const [toast, setToast] = useState<{ id: number; saved: boolean } | null>(
        null,
    );
    const toastCount = useRef(0);
    const starred =
        star === 'saving' ||
        star === 'saved' ||
        (Boolean(savedIngredient) && star !== 'removing');
    const nameInputRef = useRef<HTMLTextAreaElement>(null);
    // The name as the title shows it: the matched food, else the typed name.
    const shownName =
        ('resolvedName' in ingredientInfo && ingredientInfo.resolvedName) ||
        ingredientInfo.name;
    useAutoGrowTextarea(nameInputRef, renaming !== null, renaming ?? '');
    const startedRenaming = renaming !== null;
    useLayoutEffect(() => {
        const input = nameInputRef.current;
        if (!startedRenaming || !input) return;
        input.focus({ preventScroll: true });
        const end = input.value.length;
        input.setSelectionRange(end, end);
    }, [startedRenaming]);

    // Late photo replies are ignored once the user has moved on.
    const photoRequest = useRef(0);
    useEffect(
        () => () => {
            photoRequest.current++;
        },
        [],
    );

    // Return focus to whichever menu trigger was used.
    const iconTriggerRef = useRef<HTMLButtonElement>(null);
    const linkTriggerRef = useRef<HTMLButtonElement>(null);
    const fixOrigin = useRef<'icon' | 'link'>('icon');
    const saveButtonRef = useRef<HTMLButtonElement>(null);
    function focusFixTrigger() {
        const trigger =
            fixOrigin.current === 'link' ? linkTriggerRef : iconTriggerRef;
        window.requestAnimationFrame(() =>
            trigger.current?.focus({ preventScroll: true }),
        );
    }
    useEffect(() => {
        if (editing) saveButtonRef.current?.focus({ preventScroll: true });
    }, [editing]);

    async function chooseFix(fix: NutritionFix, origin: 'icon' | 'link') {
        fixOrigin.current = origin;
        setError(undefined);
        setScanError(null);
        setMatchNotice(undefined);
        if (editing) {
            if (fix === 'label') return setCamera('label');
            if (fix === 'values') return;
            // Keep the scanned numbers before looking for another food.
            if (!(await saveForm())) return;
        }
        if (fix === 'food')
            setMatch({ status: 'ready', query: ingredientInfo.name });
        else if (fix === 'label') setCamera('label');
        else if (fix === 'photo') setCamera('food');
        else beginEditing();
    }

    /**
     * Start from what the sheet shows now. Nutrition can arrive after the
     * sheet opens (the meal's background lookup), so never rely on values
     * captured earlier.
     */
    function beginEditing() {
        setForm(nutritionForm(ingredientInfo));
        setEditing(true);
    }

    function setFormValue(
        part: keyof NutritionForm,
        key: string,
        value: string,
    ) {
        setForm((current) => ({
            ...current,
            [part]: { ...current[part], [key]: value },
        }));
    }

    function startRenaming() {
        setError(undefined);
        setMatchNotice(undefined);
        setRenaming(shownName);
    }

    // Tapping anywhere outside the name field (not ✕ / ✓) saves the name,
    // like iOS. Scrolls and drags do not count.
    const commitLatest = useRef<() => void>(() => undefined);
    useLayoutEffect(() => {
        commitLatest.current = () => {
            if (renaming !== null && !savePending.current)
                void commitRename(renaming);
        };
    });
    useEffect(() => {
        if (!startedRenaming) return;
        let start: { x: number; y: number; id: number } | null = null;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            start =
                target instanceof Element &&
                !target.closest(
                    '.nutrition-rename-input, .ingredient-sheet-cancel, .ingredient-sheet-save',
                )
                    ? {
                          x: event.clientX,
                          y: event.clientY,
                          id: event.pointerId,
                      }
                    : null;
        };
        const onPointerUp = (event: PointerEvent) => {
            if (!start || start.id !== event.pointerId) return;
            const moved = Math.hypot(
                event.clientX - start.x,
                event.clientY - start.y,
            );
            start = null;
            if (moved <= TAP_SLOP) commitLatest.current();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointerup', onPointerUp, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('pointerup', onPointerUp, true);
        };
    }, [startedRenaming]);

    /**
     * Closing the sheet keeps a rename, as tapping out does, and changed
     * numbers, as ✓ does. Only ✕ discards.
     */
    // The sheet may hold an earlier onClose, so read the latest state.
    const keepChangesLatest = useRef<() => void>(() => undefined);
    useLayoutEffect(() => {
        keepChangesLatest.current = () => {
            commitLatest.current();
            if (
                editing &&
                renaming === null &&
                !labelScan.reading &&
                formRef.current?.checkValidity() &&
                JSON.stringify(form) !==
                    JSON.stringify(nutritionForm(ingredientInfo))
            )
                void saveForm();
        };
    });
    function closeSheet() {
        keepChangesLatest.current();
        onClose();
    }

    /** Back to the title after renaming, without a ring around it. */
    function focusTitle() {
        window.requestAnimationFrame(() => {
            const title = document.querySelector<HTMLElement>(
                '.ingredient-nutrition-sheet .ingredient-nutrition-name',
            );
            if (!title) return;
            title.tabIndex = -1;
            title.focus({ preventScroll: true });
        });
    }

    function cancelEditing() {
        if (savePending.current) return;
        if (renaming !== null) {
            setRenaming(null);
            setError(undefined);
            focusTitle();
            return;
        }
        labelScan.reset();
        setLabelFilled(false);
        setScanError(null);
        setError(undefined);
        setEditing(false);
        focusFixTrigger();
    }

    /**
     * Renames the ingredient, keeping its nutrition. A saved ingredient is
     * renamed in My Ingredients too, so its ★ stays filled.
     */
    async function commitRename(draft: string) {
        const name = draft.trim();
        const save = Boolean(collection && savedIngredient);
        if (!onRename || !name || name === shownName) return cancelEditing();
        savePending.current = true;
        setError(undefined);
        setSaving(true);
        try {
            const renamed: IngredientInfo = {
                ...withSavedId(ingredientInfo),
                name,
                // The title shows this name from now on.
                resolvedName: name,
                // A new name would look up another food; keep this one's
                // numbers, with what it lacks shown as unavailable.
                unavailableMicronutrients: MICRONUTRIENTS.map(
                    ({ key }) => key,
                ).filter(
                    (key) =>
                        ingredientInfo[key] === undefined ||
                        ingredientInfo.unavailableMicronutrients?.includes(key),
                ),
            };
            await onRename(renamed, save);
            setCommittedIngredient(renamed);
            setRenaming(null);
            focusTitle();
        } catch {
            setError('Could not save the name. Please try again.');
        } finally {
            savePending.current = false;
            setSaving(false);
        }
    }

    function showToast(saved: boolean) {
        setToast({ id: ++toastCount.current, saved });
    }

    /**
     * The ☆ saves the ingredient, as named, to My Ingredients, and the ★
     * removes it again. Like the recipe star, it changes and confirms on
     * tap, and both are withdrawn if the request fails.
     */
    async function toggleStar() {
        if (onStarAuthRequired?.()) return;
        if (!collection || star === 'saving' || star === 'removing') return;
        setError(undefined);
        if (starred) {
            const id = savedIngredient?.ingredientId;
            if (!id || !collection.remove) return;
            setStar('removing');
            showToast(false);
            try {
                await collection.remove(id);
                setStar(null);
            } catch {
                setStar(null);
                setToast(null);
                setError(
                    'Could not remove from My Ingredients. Please try again.',
                );
            }
            return;
        }
        setStar('saving');
        showToast(true);
        const toSave: IngredientInfo & {
            weight?: number;
            nutritionUnavailable?: true;
        } = { ...ingredientInfo };
        delete toSave.weight;
        delete toSave.nutritionUnavailable;
        try {
            await collection.save(toSave);
            setStar('saved');
        } catch {
            setStar(null);
            setToast(null);
            setError('Could not save to My Ingredients. Please try again.');
        }
    }

    async function handleDone(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (renaming !== null) {
            if (!savePending.current) await commitRename(renaming);
            return;
        }
        if (await saveForm()) focusFixTrigger();
    }

    /** Saves the corrected numbers and leaves editing. */
    async function saveForm() {
        if (savePending.current || labelScan.reading) return false;
        savePending.current = true;
        setError(undefined);
        setSaving(true);
        try {
            const updated = applyNutritionForm(
                withSavedId(ingredientInfo),
                form,
            );
            await onSave(updated, Boolean(savedIngredient));
            setCommittedIngredient(updated);
            labelScan.reset();
            setLabelFilled(false);
            setEditing(false);
            return true;
        } catch {
            setError('Could not save your changes. Please try again.');
            return false;
        } finally {
            savePending.current = false;
            setSaving(false);
        }
    }

    /** Fills the numbers the label shows, for review before saving. */
    function readLabel(photo: string) {
        setCamera(null);
        setError(undefined);
        setScanError(null);
        scanOpenedEditing.current = !editing;
        if (!editing) beginEditing();
        void labelScan.read(photo, ingredientInfo.name);
    }

    /** Names the photographed food, then lets the user pick its match. */
    async function identifyPhoto(photo: string) {
        setCamera(null);
        const request = ++photoRequest.current;
        setMatch({ status: 'identifying' });
        try {
            const name = await identifyFoodPhoto(photo);
            if (request !== photoRequest.current) return;
            setMatch({
                status: 'ready',
                query: name,
                notice: { text: `Looks like “${name}”.` },
            });
        } catch (photoError) {
            if (request !== photoRequest.current) return;
            setMatch({
                status: 'ready',
                query: ingredientInfo.name,
                notice: {
                    error: true,
                    text: errorMessage(
                        photoError,
                        'Couldn’t recognise the food. Search for it instead.',
                    ),
                },
            });
        }
    }

    function closeMatching() {
        if (picking) return;
        photoRequest.current++;
        setMatch(undefined);
        focusFixTrigger();
    }

    /** Replaces a wrong match with the food the user picked. */
    async function pickFood(food: FoodSearchResult) {
        if (picking) return;
        const picked = ingredientFromFood(food, ingredientInfo, savedId);
        setPicking(true);
        setError(undefined);
        try {
            await onSave(picked, Boolean(savedIngredient));
            setCommittedIngredient(picked);
            setMatchNotice(`Now using nutrition for ${food.name}.`);
            setMatch(undefined);
            focusFixTrigger();
        } catch {
            setError('Could not use that food. Please try again.');
        } finally {
            setPicking(false);
        }
    }

    const reading = labelScan.reading;
    const starLabel = starred
        ? 'Remove from My Ingredients'
        : 'Save to My Ingredients';
    const fixMenu = (variant: 'icon' | 'link') =>
        editable && (
            <NutritionFixMenu
                variant={variant}
                hidden={
                    (editing && !(variant === 'icon' && labelFilled)) ||
                    startedRenaming
                }
                disabled={saving || reading}
                triggerRef={
                    variant === 'icon' ? iconTriggerRef : linkTriggerRef
                }
                onChoose={(fix) => void chooseFix(fix, variant)}
            />
        );

    return (
        <>
            <NutritionSheetDialog
                label="Ingredient nutrition"
                onClose={closeSheet}
                editor={
                    editing || startedRenaming
                        ? {
                              formId,
                              saving,
                              ...(startedRenaming && {
                                  saveLabel: 'Save name',
                              }),
                          }
                        : undefined
                }
                onBack={match ? closeMatching : undefined}
                fullHeight={Boolean(match)}
                headerAction={
                    onRename &&
                    editable &&
                    (collection || onStarAuthRequired) && (
                        <button
                            type="button"
                            className="ingredient-sheet-star"
                            aria-pressed={starred}
                            aria-label={starLabel}
                            title={starLabel}
                            onClick={() => void toggleStar()}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5Z" />
                            </svg>
                        </button>
                    )
                }
                saveButtonRef={saveButtonRef}
            >
                <form
                    ref={formRef}
                    id={formId}
                    onSubmit={handleDone}
                    onReset={(event) => {
                        event.preventDefault();
                        cancelEditing();
                    }}
                >
                    {match?.status === 'identifying' ? (
                        <p className="nutrition-identifying" role="status">
                            <LoadingSpinner size="small" />
                            Identifying the food…
                        </p>
                    ) : match ? (
                        <FoodMatchPicker
                            key={match.query}
                            ingredientName={ingredientInfo.name}
                            initialQuery={match.query}
                            notice={match.notice}
                            currentFdcId={ingredientInfo.nutritionSource?.fdcId}
                            picking={picking}
                            onPick={(food) => void pickFood(food)}
                        />
                    ) : (
                        <IngredientNutritionContent
                            ingredient={ingredientInfo}
                            variant="sheet"
                            titleAccessory={fixMenu('icon')}
                            onTitleClick={
                                onRename && editable && !editing
                                    ? startRenaming
                                    : undefined
                            }
                            titleClickLabel={`Rename ${shownName}`}
                            titleEditor={
                                startedRenaming && (
                                    <RenameField
                                        inputRef={nameInputRef}
                                        name={renaming}
                                        disabled={saving}
                                        onChange={setRenaming}
                                    />
                                )
                            }
                            titleFooter={
                                matchNotice &&
                                !editing && (
                                    <p
                                        className="nutrition-fix-notice"
                                        role="status"
                                    >
                                        {matchNotice}
                                    </p>
                                )
                            }
                            nutritionCover={
                                reading ? (
                                    <LabelScanReading />
                                ) : scanError ? (
                                    <LabelScanFailed message={scanError}>
                                        <NutritionFixOptions
                                            disabled={saving}
                                            onChoose={(fix) =>
                                                void chooseFix(fix, 'icon')
                                            }
                                        />
                                    </LabelScanFailed>
                                ) : undefined
                            }
                            detailsFooter={fixMenu('link')}
                            onNutritionResolved={(resolved) => {
                                // Only what is shown; an open form keeps its
                                // edits and refreshes when editing starts.
                                setCommittedIngredient(resolved);
                                onNutritionResolved?.(resolved);
                            }}
                            editor={
                                editable && editing
                                    ? {
                                          values: form.macros,
                                          onValueChange: (field, value) =>
                                              setFormValue(
                                                  'macros',
                                                  field,
                                                  value,
                                              ),
                                          disabled: saving || reading,
                                          micronutrients: {
                                              values: form.micros,
                                              onChange: (key, value) =>
                                                  setFormValue(
                                                      'micros',
                                                      key,
                                                      value,
                                                  ),
                                              disabled: saving || reading,
                                              hideHint: true,
                                          },
                                      }
                                    : undefined
                            }
                        />
                    )}
                    {error && (
                        <p className="nutrition-dialog-error" role="alert">
                            {error}
                        </p>
                    )}
                </form>
                {labelScan.result && !toast && (
                    <div className="nutrition-sheet-toast">
                        <LabelScanToast
                            key={labelScan.result.id}
                            result={labelScan.result}
                            onClose={labelScan.dismissResult}
                        />
                    </div>
                )}
                {toast && (
                    // Sticky at the end of the sheet: stays at the bottom of
                    // what is visible without moving anything.
                    <div className="nutrition-sheet-toast">
                        <ActionToast
                            key={toast.id}
                            message={
                                toast.saved
                                    ? 'Saved to My Ingredients.'
                                    : 'Removed from My Ingredients.'
                            }
                            colors={successToastColors}
                            durationMs={toast.saved ? 4000 : 2400}
                            onClose={() => setToast(null)}
                            action={
                                toast.saved && collection?.open
                                    ? {
                                          label: 'View',
                                          onClick: () => {
                                              onClose();
                                              collection.open?.();
                                          },
                                      }
                                    : undefined
                            }
                        />
                    </div>
                )}
            </NutritionSheetDialog>
            {/* Outside the sheet so the camera's events never reach it. */}
            {camera === 'label' && (
                <LabelScanCamera
                    backLabel="Back to ingredient nutrition"
                    onClose={() => setCamera(null)}
                    onPhoto={readLabel}
                />
            )}
            {camera === 'food' && (
                <IngredientCamera
                    mode="food"
                    backLabel="Back to ingredient nutrition"
                    continueLabel="Use photo"
                    note="We’ll find the food in the photo for you to confirm."
                    onClose={() => setCamera(null)}
                    onContinue={(photo) => void identifyPhoto(photo)}
                />
            )}
        </>
    );
}

/** The title, renamed in place: the same type, an underline instead of a box. */
function RenameField({
    inputRef,
    name,
    disabled,
    onChange,
}: {
    inputRef: RefObject<HTMLTextAreaElement | null>;
    name: string;
    disabled: boolean;
    onChange: (name: string) => void;
}) {
    return (
        <textarea
            ref={inputRef}
            className="ingredient-nutrition-name nutrition-rename-input"
            aria-label="Ingredient name"
            placeholder="Ingredient name"
            rows={1}
            enterKeyHint="done"
            value={name}
            disabled={disabled}
            onChange={(event) =>
                // A name is one line; pasted breaks become spaces.
                onChange(event.target.value.replace(/\s*\n\s*/g, ' '))
            }
            onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                const form = event.currentTarget.form;
                if (event.key === 'Enter') {
                    event.preventDefault();
                    form?.requestSubmit();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    form?.reset();
                }
            }}
        />
    );
}
