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
    onAuthRequired,
    destinationLabel = 'My Day',
    feedbackDurationMs,
}: {
    meal: GenerateMealResponse;
    control?: JournalControl;
    disabled?: boolean;
    onAuthRequired?: () => boolean;
    destinationLabel?: string;
    feedbackDurationMs?: number;
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
        if (onAuthRequired?.()) return;
        pending.current = true;
        setSaving(true);
        setError(undefined);
        setFeedback(undefined);
        const setEntryId = control?.onChange ?? setLocalEntryId;
        try {
            if (entryId) {
                await deleteJournalEntry(entryId);
                setEntryId(null);
            } else {
                const entry = await saveJournalEntry({
                    eatenAt: new Date().toISOString(),
                    mealName: meal.mealName,
                    ingredients: meal.ingredients,
                });
                setEntryId(entry.id);
                setFeedback(`Added to ${destinationLabel}`);
            }
        } catch {
            setError(
                entryId
                    ? `Could not remove this meal from ${destinationLabel}. Please try again.`
                    : `Could not add this meal to ${destinationLabel}. Please try again.`,
            );
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }
    const label = entryId
        ? `Remove from ${destinationLabel}`
        : `Add to ${destinationLabel}`;
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
                    <LoadingSpinner size="small" tone="inherit" />
                ) : (
                    <MyDayIcon remove={Boolean(entryId)} />
                )}
            </button>
            {feedback && (
                <ActionFeedback
                    key={feedback}
                    message={feedback}
                    onClose={closeFeedback}
                    durationMs={feedbackDurationMs}
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
