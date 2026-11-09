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
import EditIcon from '../../components/EditIcon';
import IngredientNutritionContent from './IngredientNutritionContent';
import NutritionSheetDialog from './NutritionSheetDialog';
import type { NutritionFieldId } from './NutritionField';
import './NutritionDialog.css';
import { IngredientCollectionContext } from '../../ingredients/IngredientCollectionContext';
import {
    isUserIngredient,
    normalizeIngredientName,
} from '../../utils/Ingredient';

const fields: readonly NutritionFieldId[] = [
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
    'sugarPer100g',
    'saturatedFatPer100g',
    'fiberPer100g',
];

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

export default function NutritionDialog({
    ingredientInfo: suppliedIngredient,
    onClose,
    onSave,
    onNutritionResolved,
    editable = true,
}: NutritionDialogProps) {
    const [committedIngredient, setCommittedIngredient] = useState<
        IngredientInfo | UserIngredient
    >();
    const ingredientInfo = committedIngredient ?? suppliedIngredient;
    const formId = useId();
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const saveButtonRef = useRef<HTMLButtonElement>(null);
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
    const [error, setError] = useState<string>();
    const pending = useRef(false);
    const [editing, setEditing] = useState(false);
    const [ingredientName, setIngredientName] = useState(ingredientInfo.name);
    const [values, setValues] = useState(
        () =>
            Object.fromEntries(
                fields.map((field) => [
                    field,
                    String(ingredientInfo[field] ?? ''),
                ]),
            ) as Record<NutritionFieldId, string>,
    );
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (editing) saveButtonRef.current?.focus({ preventScroll: true });
    }, [editing]);

    function cancelEditing() {
        if (pending.current) return;
        setIngredientName(ingredientInfo.name);
        setValues(
            Object.fromEntries(
                fields.map((field) => [
                    field,
                    String(ingredientInfo[field] ?? ''),
                ]),
            ) as Record<NutritionFieldId, string>,
        );
        setError(undefined);
        setEditing(false);
        window.requestAnimationFrame(() =>
            editButtonRef.current?.focus({ preventScroll: true }),
        );
    }

    async function handleDone(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setError(undefined);
        setSaving(true);
        try {
            const updated = {
                ...ingredientInfo,
                ...(savedIngredient
                    ? { ingredientId: savedIngredient.ingredientId }
                    : {}),
                name: ingredientName.trim() || ingredientInfo.name,
                ...Object.fromEntries(
                    fields.map((field) => [
                        field,
                        values[field].trim() === ''
                            ? undefined
                            : Number(values[field]),
                    ]),
                ),
            };
            await onSave(updated, Boolean(savedIngredient));
            setCommittedIngredient(updated);
            setEditing(false);
            window.requestAnimationFrame(() =>
                editButtonRef.current?.focus({ preventScroll: true }),
            );
        } catch {
            setError('Could not save your changes. Please try again.');
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return (
        <NutritionSheetDialog
            label="Ingredient nutrition"
            onClose={onClose}
            editor={editing ? { formId, saving } : undefined}
            saveButtonRef={saveButtonRef}
            readAction={
                editable && !editing ? (
                    <button
                        ref={editButtonRef}
                        key="edit-nutrition"
                        type="button"
                        className="edit-icon-button ingredient-sheet-edit"
                        aria-label="Edit ingredient nutrition"
                        title="Edit ingredient nutrition"
                        disabled={saving}
                        onClick={(event) => {
                            event.preventDefault();
                            setError(undefined);
                            setEditing(true);
                        }}
                    >
                        <EditIcon />
                    </button>
                ) : undefined
            }
        >
            <form
                id={formId}
                onSubmit={handleDone}
                onReset={(event) => {
                    event.preventDefault();
                    cancelEditing();
                }}
            >
                <IngredientNutritionContent
                    ingredient={ingredientInfo}
                    variant="sheet"
                    onNutritionResolved={(resolved) => {
                        setCommittedIngredient(resolved);
                        setIngredientName(resolved.name);
                        setValues(
                            Object.fromEntries(
                                fields.map((field) => [
                                    field,
                                    String(resolved[field] ?? ''),
                                ]),
                            ) as Record<NutritionFieldId, string>,
                        );
                        onNutritionResolved?.(resolved);
                    }}
                    editor={
                        editable && editing
                            ? {
                                  name: ingredientName,
                                  values,
                                  onNameChange: setIngredientName,
                                  onValueChange: (field, value) =>
                                      setValues((current) => ({
                                          ...current,
                                          [field]: value,
                                      })),
                                  disabled: saving,
                              }
                            : undefined
                    }
                />
                {error && (
                    <p className="nutrition-dialog-error" role="alert">
                        {error}
                    </p>
                )}
            </form>
        </NutritionSheetDialog>
    );
}
