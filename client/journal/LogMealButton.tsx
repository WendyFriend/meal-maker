import { useCallback, useRef, useState } from 'react';
import type { GenerateMealResponse } from '../../shared/types/types';
import {
    deleteJournalEntry,
    saveJournalEntry,
} from '../services/journalService';
import LoadingSpinner from '../components/LoadingSpinner';
import MyDayIcon from '../components/MyDayIcon';
import ActionFeedback from '../components/ActionFeedback';
import './LogMealButton.css';

export type JournalControl = {
    entryId: string | null;
    onChange: (id: string | null) => void;
};
export default function LogMealButton({
    meal,
    control,
    disabled = false,
}: {
    meal: GenerateMealResponse;
    control?: JournalControl;
    disabled?: boolean;
}) {
    const [localEntryId, setLocalEntryId] = useState<string | null>(null);
    const entryId = control ? control.entryId : localEntryId;
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<string>();
    const [error, setError] = useState<string>();
    const pending = useRef(false);
    const closeFeedback = useCallback(() => setFeedback(undefined), []);
    async function toggleMeal() {
        if (disabled || pending.current) return;
        pending.current = true;
        setSaving(true);
        setError(undefined);
        setFeedback(undefined);
        const setEntryId = control?.onChange ?? setLocalEntryId;
        try {
            if (entryId) {
                await deleteJournalEntry(entryId);
                setEntryId(null);
                setFeedback('Removed from My Day');
            } else {
                const entry = await saveJournalEntry({
                    eatenAt: new Date().toISOString(),
                    mealName: meal.mealName,
                    ingredients: meal.ingredients,
                });
                setEntryId(entry.id);
                setFeedback('Added to My Day');
            }
        } catch {
            setError(
                entryId
                    ? 'Could not remove this meal from My Day. Please try again.'
                    : 'Could not add this meal to My Day. Please try again.',
            );
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }
    const label = entryId ? 'Remove from My Day' : 'Add to My Day';
    return (
        <div className="journal-log-action">
            <button
                type="button"
                className="journal-log-trigger"
                aria-label={label}
                title={label}
                aria-pressed={Boolean(entryId)}
                aria-busy={saving}
                disabled={
                    disabled ||
                    saving ||
                    (!entryId &&
                        !meal.ingredients.some(
                            (ingredient) => ingredient.weight > 0,
                        ))
                }
                onClick={toggleMeal}
            >
                {saving ? (
                    <LoadingSpinner size="small" />
                ) : (
                    <MyDayIcon remove={Boolean(entryId)} />
                )}
            </button>
            {feedback && (
                <ActionFeedback
                    key={feedback}
                    message={feedback}
                    onClose={closeFeedback}
                />
            )}
            {error && (
                <p className="journal-log-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
