import { useCallback, useRef, useState } from 'react';
import type { GenerateMealResponse } from '../../shared/types/types';
import {
    deleteJournalEntry,
    saveJournalEntry,
} from '../services/journalService';
import MyDayIcon from '../components/MyDayIcon';
import ActionToast from '../components/ActionToast';
import { successToastColors } from '../components/actionToastColors';
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
    // Shown at once while the request runs, so the tap feels immediate.
    const [optimisticAdded, setOptimisticAdded] = useState<boolean | null>(
        null,
    );
    const added = optimisticAdded ?? Boolean(entryId);
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
        setOptimisticAdded(!entryId);
        setFeedback(entryId ? undefined : `Added to ${destinationLabel}.`);
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
            }
        } catch {
            setFeedback(undefined);
            setError(
                entryId
                    ? `Could not remove this meal from ${destinationLabel}. Please try again.`
                    : `Could not add this meal to ${destinationLabel}. Please try again.`,
            );
        } finally {
            pending.current = false;
            setOptimisticAdded(null);
            setSaving(false);
        }
    }
    const label = added
        ? `Remove from ${destinationLabel}`
        : `Add to ${destinationLabel}`;
    return (
        <div className="journal-log-action">
            <button
                type="button"
                className="journal-log-trigger"
                aria-label={label}
                title={label}
                aria-pressed={added}
                aria-busy={saving}
                // Stays enabled while saving (taps are ignored until it
                // settles) so the instant feedback is not dimmed.
                disabled={
                    disabled ||
                    (!added &&
                        !meal.ingredients.some(
                            (ingredient) => ingredient.weight > 0,
                        ))
                }
                onClick={toggleMeal}
            >
                <MyDayIcon remove={added} />
            </button>
            {feedback && (
                <ActionToast
                    key={feedback}
                    message={feedback}
                    placement="floating"
                    colors={successToastColors}
                    onClose={closeFeedback}
                    durationMs={feedbackDurationMs ?? 1800}
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
