import { useState, type FormEvent } from 'react';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import EditIcon from '../../components/EditIcon';
import { getIngredientPreparation } from '../../../shared/ingredientPreparation';
import IngredientNutritionContent from './IngredientNutritionContent';
import NutritionSheetDialog from './NutritionSheetDialog';
import type { NutritionFieldId } from './NutritionField';
import './NutritionDialog.css';

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
};

export default function NutritionDialog({
    ingredientInfo,
    onClose,
    onSave,
}: NutritionDialogProps) {
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
    const [preparationTips, setPreparationTips] = useState(() =>
        getIngredientPreparation(
            ingredientInfo.name,
            ingredientInfo.preparationTips,
        ).tips.join('\n'),
    );
    const [saveToUserIngredients, setSaveToUserIngredients] = useState(true);
    const [saving, setSaving] = useState(false);

    async function handleDone(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;
        const tips = preparationTips
            .split('\n')
            .map((tip) => tip.trim())
            .filter(Boolean);
        const originalTips = getIngredientPreparation(
            ingredientInfo.name,
            ingredientInfo.preparationTips,
        ).tips;
        setSaving(true);
        try {
            await onSave(
                {
                    ...ingredientInfo,
                    name: ingredientName.trim() || ingredientInfo.name,
                    ...Object.fromEntries(
                        fields.map((field) => [
                            field,
                            values[field].trim() === ''
                                ? undefined
                                : Number(values[field]),
                        ]),
                    ),
                    preparationTips:
                        JSON.stringify(tips) === JSON.stringify(originalTips)
                            ? ingredientInfo.preparationTips
                            : tips,
                },
                saveToUserIngredients,
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <NutritionSheetDialog label="Ingredient nutrition" onClose={onClose}>
            <form onSubmit={handleDone}>
                <IngredientNutritionContent
                    ingredient={ingredientInfo}
                    onClose={onClose}
                    headerAction={
                        !editing && (
                            <button
                                type="button"
                                className="edit-icon-button"
                                aria-label="Edit ingredient nutrition"
                                title="Edit ingredient nutrition"
                                onClick={(event) => {
                                    event.preventDefault();
                                    setEditing(true);
                                }}
                            >
                                <EditIcon />
                            </button>
                        )
                    }
                    editor={
                        editing
                            ? {
                                  name: ingredientName,
                                  values,
                                  preparationTips,
                                  onNameChange: setIngredientName,
                                  onValueChange: (field, value) =>
                                      setValues((current) => ({
                                          ...current,
                                          [field]: value,
                                      })),
                                  onPreparationChange: setPreparationTips,
                                  disabled: saving,
                              }
                            : undefined
                    }
                />
                {editing && (
                    <>
                        <label className="save-ingredient-option">
                            <input
                                type="checkbox"
                                checked={saveToUserIngredients}
                                disabled={saving}
                                onChange={(event) =>
                                    setSaveToUserIngredients(
                                        event.target.checked,
                                    )
                                }
                            />
                            Save to Ingredients
                        </label>
                        <button
                            type="submit"
                            className="nutrition-dialog-done"
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : 'Done'}
                        </button>
                    </>
                )}
            </form>
        </NutritionSheetDialog>
    );
}
