import {
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type FormEvent,
} from 'react';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import IngredientCamera from '../../components/IngredientCamera';
import LoadingSpinner from '../../components/LoadingSpinner';
import { ActionSheetIcon } from '../../components/ActionSheet';
import type { FoodSearchResult } from '../../services/foodSearchService';
import {
    identifyFoodPhoto,
    scanNutritionLabel,
} from '../../services/nutritionPhotoService';
import { IngredientCollectionContext } from '../../ingredients/IngredientCollectionContext';
import {
    isUserIngredient,
    normalizeIngredientName,
} from '../../utils/Ingredient';
import FoodMatchPicker from './FoodMatchPicker';
import IngredientNutritionContent from './IngredientNutritionContent';
import NutritionFixMenu, { type NutritionFix } from './NutritionFixMenu';
import NutritionSheetDialog from './NutritionSheetDialog';
import {
    MACRO_FIELDS,
    applyNutritionForm,
    errorMessage,
    ingredientFromFood,
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

type ScanState =
    | { state: 'reading' }
    | { state: 'filled'; count: number }
    | { state: 'failed'; message: string };

type NutritionDialogProps = {
    ingredientInfo: UserIngredient | IngredientInfo;
    onClose: () => void;
    onSave: (
        ingredient: UserIngredient | IngredientInfo,
        saveToUserIngredients: boolean,
    ) => Promise<void>;
    onNutritionResolved?: (ingredient: IngredientInfo) => void;
    editable?: boolean;
};

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
    const [scan, setScan] = useState<ScanState>();
    const [match, setMatch] = useState<MatchState>();
    const [picking, setPicking] = useState(false);
    const [matchNotice, setMatchNotice] = useState<string>();

    // Late photo replies are ignored once the user has moved on.
    const scanRequest = useRef(0);
    const photoRequest = useRef(0);
    useEffect(
        () => () => {
            scanRequest.current++;
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

    function chooseFix(fix: NutritionFix, origin: 'icon' | 'link') {
        fixOrigin.current = origin;
        setError(undefined);
        setMatchNotice(undefined);
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

    function cancelEditing() {
        if (savePending.current) return;
        scanRequest.current++;
        setScan(undefined);
        setError(undefined);
        setEditing(false);
        focusFixTrigger();
    }

    async function handleDone(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (savePending.current || scan?.state === 'reading') return;
        savePending.current = true;
        setError(undefined);
        setSaving(true);
        try {
            const updated = applyNutritionForm(
                {
                    ...ingredientInfo,
                    ...(savedIngredient && {
                        ingredientId: savedIngredient.ingredientId,
                    }),
                },
                form,
            );
            await onSave(updated, Boolean(savedIngredient));
            setCommittedIngredient(updated);
            setScan(undefined);
            setEditing(false);
            focusFixTrigger();
        } catch {
            setError('Could not save your changes. Please try again.');
        } finally {
            savePending.current = false;
            setSaving(false);
        }
    }

    /** Fills the numbers the label shows, for review before saving. */
    async function readLabel(photo: string) {
        setCamera(null);
        beginEditing();
        const request = ++scanRequest.current;
        setScan({ state: 'reading' });
        try {
            const { nutrition } = await scanNutritionLabel(photo);
            if (request !== scanRequest.current) return;
            const scanned = MACRO_FIELDS.filter(
                (field) => nutrition[field] !== undefined,
            );
            setForm((current) => ({
                ...current,
                macros: {
                    ...current.macros,
                    ...Object.fromEntries(
                        scanned.map((field) => [
                            field,
                            String(nutrition[field]),
                        ]),
                    ),
                },
            }));
            setScan({ state: 'filled', count: scanned.length });
        } catch (scanError) {
            if (request !== scanRequest.current) return;
            setScan({
                state: 'failed',
                message: errorMessage(
                    scanError,
                    'Could not read the label. Please try again.',
                ),
            });
        }
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

    const reading = scan?.state === 'reading';
    const fixMenu = (variant: 'icon' | 'link') =>
        editable && (
            <NutritionFixMenu
                variant={variant}
                hidden={editing}
                disabled={saving}
                triggerRef={
                    variant === 'icon' ? iconTriggerRef : linkTriggerRef
                }
                onChoose={(fix) => chooseFix(fix, variant)}
            />
        );

    return (
        <>
            <NutritionSheetDialog
                label="Ingredient nutrition"
                onClose={onClose}
                editor={editing ? { formId, saving } : undefined}
                onBack={match ? closeMatching : undefined}
                fullHeight={Boolean(match)}
                saveButtonRef={saveButtonRef}
            >
                <form
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
                            afterHeader={
                                editing &&
                                scan && (
                                    <ScanFeedback
                                        scan={scan}
                                        disabled={saving}
                                        onScanAgain={() => setCamera('label')}
                                    />
                                )
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
                                              setForm((current) => ({
                                                  ...current,
                                                  macros: {
                                                      ...current.macros,
                                                      [field]: value,
                                                  },
                                              })),
                                          disabled: saving || reading,
                                          micronutrients: {
                                              values: form.micros,
                                              onChange: (key, value) =>
                                                  setForm((current) => ({
                                                      ...current,
                                                      micros: {
                                                          ...current.micros,
                                                          [key]: value,
                                                      },
                                                  })),
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
            </NutritionSheetDialog>
            {/* Outside the sheet so the camera's events never reach it. */}
            {camera && (
                <IngredientCamera
                    mode={camera}
                    backLabel="Back to ingredient nutrition"
                    continueLabel="Use photo"
                    note={
                        camera === 'label'
                            ? 'We’ll fill in the values from the label for you to check.'
                            : 'We’ll find the food in the photo for you to confirm.'
                    }
                    onClose={() => setCamera(null)}
                    onContinue={(photo) =>
                        void (camera === 'label'
                            ? readLabel(photo)
                            : identifyPhoto(photo))
                    }
                />
            )}
        </>
    );
}

/** Label scan progress and result, shown under the header while editing. */
function ScanFeedback({
    scan,
    disabled,
    onScanAgain,
}: {
    scan: ScanState;
    disabled: boolean;
    onScanAgain: () => void;
}) {
    return (
        <div className="nutrition-edit-hint">
            {scan.state === 'reading' ? (
                <p className="nutrition-edit-status" role="status">
                    <LoadingSpinner size="small" />
                    Reading label…
                </p>
            ) : (
                <>
                    {scan.state === 'filled' ? (
                        <p className="nutrition-edit-status" role="status">
                            Filled {scan.count}{' '}
                            {scan.count === 1 ? 'value' : 'values'} per 100 g
                            from the label. Check them, then save.
                        </p>
                    ) : (
                        <p
                            className="nutrition-edit-status nutrition-edit-error"
                            role="alert"
                        >
                            {scan.message}
                        </p>
                    )}
                    <button
                        type="button"
                        className="nutrition-scan-again"
                        disabled={disabled}
                        onClick={onScanAgain}
                    >
                        <ActionSheetIcon symbol="scan" />
                        Scan again
                    </button>
                </>
            )}
        </div>
    );
}
