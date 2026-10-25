import { useState } from 'react';
import type { MealSlotConfig } from '../../shared/types/profile';
import { addDays, fromDateKey, toDateKey } from '../services/mealPlanService';
import type { PlannedMeal } from './budget';
import { formatDayTitle, formatShortDate } from './plannerDates';
import Sheet from './Sheet';
import './AddMealSheet.css';

type CopyMealDialogProps = {
    meal: PlannedMeal;
    slots: MealSlotConfig[];
    todayKey: string;
    // Furthest day (inclusive) the plan allows.
    lastDateKey: string;
    initialDate: string;
    // Resolves to an error message to show, or null once copied.
    onCopy: (date: string, slot: string) => Promise<string | null>;
    onClose: () => void;
};

const MAX_DAYS_OFFERED = 14;

/* Pick another day (and period) to copy a planned meal to. */
export default function CopyMealDialog({
    meal,
    slots,
    todayKey,
    lastDateKey,
    initialDate,
    onCopy,
    onClose,
}: CopyMealDialogProps) {
    const days: string[] = [];

    for (let offset = 0; offset < MAX_DAYS_OFFERED; offset++) {
        const key = toDateKey(addDays(fromDateKey(todayKey), offset));

        if (key > lastDateKey) break;
        days.push(key);
    }

    const fallbackSlot = slots.some((slot) => slot.id === meal.entry.slot)
        ? meal.entry.slot
        : (slots[0]?.id ?? meal.entry.slot);
    const [date, setDate] = useState(
        days.includes(initialDate) ? initialDate : (days[0] ?? initialDate),
    );
    const [slot, setSlot] = useState(fallbackSlot);
    const [isCopying, setIsCopying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCopy() {
        setIsCopying(true);
        setError(await onCopy(date, slot));
        setIsCopying(false);
    }

    return (
        <Sheet
            title="Copy to another day"
            subtitle={meal.recipe.recipeName}
            onClose={onClose}
        >
            <div className="copy-dialog">
                <label className="copy-dialog-field">
                    <span>Day</span>
                    <select
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    >
                        {days.map((key) => (
                            <option key={key} value={key}>
                                {formatDayTitle(key, todayKey)} ·{' '}
                                {formatShortDate(key)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="copy-dialog-field">
                    <span>Meal period</span>
                    <select
                        value={slot}
                        onChange={(event) => setSlot(event.target.value)}
                    >
                        {slots.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                {error && (
                    <p className="add-sheet-error" role="alert">
                        {error}
                    </p>
                )}
                <div className="copy-dialog-actions">
                    <button
                        type="button"
                        className="add-sheet-text-button"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="add-sheet-primary"
                        onClick={handleCopy}
                        disabled={isCopying}
                    >
                        {isCopying ? 'Copying...' : 'Copy meal'}
                    </button>
                </div>
            </div>
        </Sheet>
    );
}
