import type { DetailEditorHandle } from './components/DetailEditorHandle';
import {
    useImperativeHandle,
    useRef,
    useState,
    type Ref,
    type FormEvent,
} from 'react';
import type { Recipe } from '../shared/types/recipe';
import type { GenerateMealResponse } from '../shared/types/types';
import MealResult from './meal-generator/components/MealResult';
import LoadingSpinner from './components/LoadingSpinner';
import './RecipeDetail.css';

function toMeal(recipe: Recipe): GenerateMealResponse {
    return {
        mealName: recipe.recipeName,
        ingredients: recipe.ingredients.map((ingredient) => ({
            ...ingredient,
        })),
        instructions: [...recipe.instructions],
    };
}

export default function RecipeDetail({
    recipe,
    ref,
    onSave,
    onEditorStateChange,
}: {
    ref?: Ref<DetailEditorHandle>;
    recipe: Recipe;
    onSave: (recipe: Recipe) => Promise<Recipe>;
    onEditorStateChange: (state: { editing: boolean; saving: boolean }) => void;
}) {
    const [originalMeal, setOriginalMeal] = useState(() => toMeal(recipe));
    const [meal, setMeal] = useState(originalMeal);
    const [editing, setEditing] = useState(false);
    const [instructionsEdited, setInstructionsEdited] = useState(false);
    const [saving, setSaving] = useState(false);
    const [journalEntryId, setJournalEntryId] = useState<string | null>(null);
    const [resetVersion, setResetVersion] = useState(0);
    const [error, setError] = useState<string>();
    const pending = useRef(false);
    const dirty = JSON.stringify(meal) !== JSON.stringify(originalMeal);

    useImperativeHandle(ref, () => ({
        edit: () => {
            if (pending.current) return;
            setEditing(true);
            onEditorStateChange({ editing: true, saving: false });
        },
    }));

    function changeMeal(next: GenerateMealResponse, editorActive = editing) {
        if (pending.current) return;
        setMeal(next);
        setError(undefined);
        onEditorStateChange({
            editing:
                editorActive ||
                JSON.stringify(next) !== JSON.stringify(originalMeal),
            saving: false,
        });
    }
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending.current) return;
        if (!meal.mealName.trim()) {
            setError('Enter a meal name.');
            return;
        }
        if (!dirty) {
            setEditing(false);
            setInstructionsEdited(false);
            setResetVersion((current) => current + 1);
            onEditorStateChange({ editing: false, saving: false });
            return;
        }
        pending.current = true;
        setSaving(true);
        setError(undefined);
        onEditorStateChange({ editing: true, saving: true });
        try {
            const updated = await onSave({
                ...recipe,
                recipeName: meal.mealName.trim(),
                ingredients: meal.ingredients,
                instructions: meal.instructions
                    .map((step) => step.trim())
                    .filter(Boolean),
            });
            const saved = toMeal(updated);
            setOriginalMeal(saved);
            setMeal(saved);
            setEditing(false);
            setInstructionsEdited(false);
            setResetVersion((current) => current + 1);
            onEditorStateChange({ editing: false, saving: false });
        } catch {
            setError(
                'Could not save your meal. Your changes are still here; please try again.',
            );
            onEditorStateChange({ editing: true, saving: false });
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return (
        <form
            id="meal-detail-form"
            className="recipe-detail"
            onSubmit={save}
            onReset={(event) => {
                event.preventDefault();
                if (pending.current) return;
                setMeal(originalMeal);
                setEditing(false);
                setInstructionsEdited(false);
                setError(undefined);
                setResetVersion((current) => current + 1);
                onEditorStateChange({ editing: false, saving: false });
            }}
            aria-busy={saving}
        >
            {error && (
                <p className="recipe-detail-error" role="alert">
                    {error}
                </p>
            )}
            <fieldset className="recipe-detail-fields" disabled={saving}>
                <MealResult
                    key={resetVersion}
                    meal={meal}
                    originalMeal={originalMeal}
                    onChange={changeMeal}
                    showBookmark={false}
                    showJournalButton={!editing}
                    onNameChange={
                        editing
                            ? (name) => changeMeal({ ...meal, mealName: name })
                            : undefined
                    }
                    journalControl={{
                        entryId: journalEntryId,
                        onChange: setJournalEntryId,
                    }}
                    showWeightControls={editing}
                    instructionEditor={{
                        editing: editing,
                        canReset: instructionsEdited,
                        onReset: () => {
                            setInstructionsEdited(false);
                            changeMeal(
                                {
                                    ...meal,
                                    instructions: [
                                        ...originalMeal.instructions,
                                    ],
                                },
                                true,
                            );
                        },
                        onChange: (value) => {
                            setInstructionsEdited(true);
                            changeMeal({
                                ...meal,
                                instructions: value.split('\n'),
                            });
                        },
                        disabled: saving,
                    }}
                />
            </fieldset>
            {dirty && (
                <div className="recipe-detail-save-bar">
                    <button type="submit" disabled={saving}>
                        {saving ? (
                            <span className="loading-label">
                                <LoadingSpinner size="small" tone="inherit" />
                                Saving…
                            </span>
                        ) : (
                            'Save'
                        )}
                    </button>
                </div>
            )}
        </form>
    );
}
