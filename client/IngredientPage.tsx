import type { DetailEditorHandle } from './components/DetailEditorHandle';
import { useImperativeHandle, useState, type Ref, type FormEvent } from 'react';
import type {
    IngredientInfo,
    IngredientNutrition,
} from '../shared/types/types';
import IngredientNutritionContent from './meal-generator/components/IngredientNutritionContent';
import type { NutritionFieldId } from './meal-generator/components/NutritionField';
import './IngredientDetail.css';
import type { MicronutrientKey } from '../shared/micronutrients';

const fields: readonly NutritionFieldId[] = [
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
    'sugarPer100g',
    'saturatedFatPer100g',
    'fiberPer100g',
];
const requiredFields = new Set<NutritionFieldId>([
    'caloriesPer100g',
    'proteinPer100g',
    'carbohydratePer100g',
    'fatPer100g',
]);
type Draft = {
    name: string;
    values: Record<NutritionFieldId, string>;
    micronutrients: Partial<Record<MicronutrientKey, string>>;
};

export default function IngredientPage({
    ingredient,
    ref,
    onSave,
    creating = false,
    onCancel,
    findExistingIngredient,
    onEditorStateChange,
}: {
    onEditorStateChange: (state: { editing: boolean; saving: boolean }) => void;
    ref?: Ref<DetailEditorHandle>;
    ingredient: IngredientInfo;
    onSave: (ingredient: IngredientNutrition) => Promise<void>;
    creating?: boolean;
    onCancel?: () => void;
    findExistingIngredient?: (name: string) => string | undefined;
}) {
    const [draft, setDraft] = useState<Draft | null>(() =>
        creating
            ? {
                  name: ingredient.name,
                  values: Object.fromEntries(
                      fields.map((field) => [
                          field,
                          ingredient.name && ingredient[field] !== undefined
                              ? String(ingredient[field])
                              : '',
                      ]),
                  ) as Draft['values'],
                  micronutrients: {},
              }
            : null,
    );
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();

    function beginEdit() {
        setError(undefined);
        onEditorStateChange({ editing: true, saving: false });
        setDraft({
            name: ingredient.name,
            micronutrients: {},
            values: Object.fromEntries(
                fields.map((field) => [field, String(ingredient[field] ?? '')]),
            ) as Draft['values'],
        });
    }
    useImperativeHandle(ref, () => ({ edit: beginEdit }));
    function cancelEdit() {
        if (saving || saved) return;
        if (creating) {
            onCancel?.();
            return;
        }
        onEditorStateChange({ editing: false, saving: false });
        setDraft(null);
        setError(undefined);
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!draft || saving || saved) return;
        const name = draft.name.trim();
        if (
            !name ||
            Object.values(draft.micronutrients).some(
                (value) =>
                    value.trim() !== '' &&
                    (!Number.isFinite(Number(value)) || Number(value) < 0),
            ) ||
            fields.some((field) => {
                const value = draft.values[field].trim();
                return (
                    (requiredFields.has(field) && !value) ||
                    (value !== '' &&
                        (!Number.isFinite(Number(value)) || Number(value) < 0))
                );
            })
        ) {
            setError(
                'Enter an ingredient name and valid, non-negative nutrition values.',
            );
            return;
        }
        const existing = findExistingIngredient?.(name);
        if (existing) {
            setError(`${existing} is already in your ingredients.`);
            return;
        }
        const updated = {
            ...ingredient,
            name,
            ...Object.fromEntries(
                fields.map((field) => [
                    field,
                    draft.values[field].trim() === ''
                        ? undefined
                        : Number(draft.values[field]),
                ]),
            ),
            ...Object.fromEntries(
                Object.entries(draft.micronutrients).map(([key, value]) => [
                    key,
                    value.trim() === '' ? undefined : Number(value),
                ]),
            ),
        } as IngredientNutrition;
        setSaving(true);
        onEditorStateChange({ editing: true, saving: true });
        setError(undefined);
        try {
            await onSave(updated);
            if (creating) {
                setSaved(true);
                onEditorStateChange({ editing: true, saving: true });
            } else {
                setDraft(null);
                onEditorStateChange({ editing: false, saving: false });
            }
        } catch {
            onEditorStateChange({ editing: true, saving: false });
            setError(
                'Could not save your changes. Your edits are still here; please try again.',
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <section
            className={`ingredient-detail${draft ? ' ingredient-detail-editing' : ''}`}
            tabIndex={-1}
            aria-label={
                creating ? 'Add ingredient' : `${ingredient.name} nutrition`
            }
        >
            <form
                id="ingredient-detail-form"
                onSubmit={save}
                onReset={(event) => {
                    event.preventDefault();
                    cancelEdit();
                }}
                aria-busy={saving}
            >
                {error && (
                    <p className="ingredient-detail-error" role="alert">
                        {error}
                    </p>
                )}
                <IngredientNutritionContent
                    ingredient={ingredient}
                    headingLevel="h1"
                    editor={
                        draft
                            ? {
                                  ...draft,
                                  showRequiredMarkers: creating,
                                  disabled: saving || saved,
                                  micronutrients: {
                                      values: draft.micronutrients,
                                      disabled: saving || saved,
                                      onChange: (key, value) =>
                                          setDraft(
                                              (current) =>
                                                  current && {
                                                      ...current,
                                                      micronutrients: {
                                                          ...current.micronutrients,
                                                          [key]: value,
                                                      },
                                                  },
                                          ),
                                  },
                                  onNameChange: (name) =>
                                      setDraft(
                                          (current) =>
                                              current && { ...current, name },
                                      ),
                                  onValueChange: (field, value) =>
                                      setDraft(
                                          (current) =>
                                              current && {
                                                  ...current,
                                                  values: {
                                                      ...current.values,
                                                      [field]: value,
                                                  },
                                              },
                                      ),
                              }
                            : undefined
                    }
                />
                {draft && (
                    <div className="ingredient-detail-save-bar">
                        <button type="submit" disabled={saving || saved}>
                            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                )}
            </form>
        </section>
    );
}
