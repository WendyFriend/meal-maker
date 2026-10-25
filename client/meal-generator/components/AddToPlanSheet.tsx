import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './AddToPlanSheet.css';
import type { MealType } from '../../../shared/types/types';
import type { MealSlotConfig } from '../../../shared/types/profile';
import { addDays, toDateKey } from '../../services/mealPlanService';
import { usePlan } from '../../plan/PlanContext';
import UpgradeNotice from '../../plan/UpgradeNotice';

export type AddToPlanResult = 'added' | 'limit' | 'error';

type AddToPlanSheetProps = {
    mealName: string;
    mealType?: MealType;
    // Saves the meal if needed and puts it on the plan.
    onAdd: (planDate: string, slot: string) => Promise<AddToPlanResult>;
    onClose: () => void;
};

// Days offered as chips; further out is picked with the date field.
const MAX_DAY_CHIPS = 14;

/* The slot matching the meal type, else the next one coming up today. */
function pickDefaultSlot(
    slots: MealSlotConfig[],
    mealType: MealType | undefined,
    now = new Date(),
): string | undefined {
    if (mealType && slots.some((slot) => slot.id === mealType)) {
        return mealType;
    }

    const minutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = slots.find((slot) => {
        if (!slot.time) return false;
        const [hours, mins] = slot.time.split(':').map(Number);

        return hours * 60 + mins >= minutes;
    });

    return (upcoming ?? slots[slots.length - 1])?.id;
}

function formatDay(date: Date, today: Date): string {
    const offset = Math.round((date.getTime() - today.getTime()) / 86_400_000);

    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';

    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`;
}

function AddToPlanSheet({
    mealName,
    mealType,
    onAdd,
    onClose,
}: AddToPlanSheetProps) {
    const { limits, profile } = usePlan();
    const panelRef = useRef<HTMLDivElement>(null);

    const [today] = useState(() => {
        const now = new Date();

        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    const lastDay = addDays(today, limits.planningDaysAhead);
    const chipDays = Array.from(
        { length: Math.min(limits.planningDaysAhead, MAX_DAY_CHIPS - 1) + 1 },
        (_, index) => addDays(today, index),
    );

    const [day, setDay] = useState(toDateKey(today));
    const [slot, setSlot] = useState(() =>
        pickDefaultSlot(profile.mealSlots, mealType),
    );
    const [status, setStatus] = useState<'idle' | 'adding' | AddToPlanResult>(
        'idle',
    );

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        document.addEventListener('keydown', handleKeyDown);
        panelRef.current?.focus();

        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const chosenDay = new Date(`${day}T00:00:00`);
    const chosenSlot = profile.mealSlots.find((item) => item.id === slot);
    const isChipDay = chipDays.some((date) => toDateKey(date) === day);

    async function handleAdd() {
        if (!slot || status === 'adding') return;

        setStatus('adding');
        setStatus(await onAdd(day, slot));
    }

    return createPortal(
        <>
            <div
                className="add-plan-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Add to plan"
                tabIndex={-1}
                className="add-plan-sheet"
            >
                {status === 'added' ? (
                    <div className="add-plan-done" role="status">
                        <span className="add-plan-done-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" focusable="false">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                        </span>
                        <h4>Added to your plan</h4>
                        <p>
                            {mealName} is planned for{' '}
                            {formatDay(chosenDay, today).toLowerCase()}
                            {chosenSlot ? `, ${chosenSlot.label}` : ''}.
                        </p>
                        <button
                            type="button"
                            className="add-plan-primary"
                            onClick={onClose}
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        <div>
                            <h4 className="add-plan-title">Add to plan</h4>
                            <p className="add-plan-meal">{mealName}</p>
                        </div>

                        <div className="add-plan-group">
                            <span className="add-plan-label" id="add-plan-day">
                                Day
                            </span>
                            <div
                                className="add-plan-chips add-plan-days"
                                role="group"
                                aria-labelledby="add-plan-day"
                            >
                                {chipDays.map((date) => {
                                    const key = toDateKey(date);

                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            className="add-plan-chip"
                                            aria-pressed={key === day}
                                            onClick={() => setDay(key)}
                                        >
                                            {formatDay(date, today)}
                                        </button>
                                    );
                                })}
                            </div>

                            {limits.planningDaysAhead >= MAX_DAY_CHIPS && (
                                <label className="add-plan-later">
                                    <span>Or pick a later date</span>
                                    <input
                                        type="date"
                                        value={isChipDay ? '' : day}
                                        min={toDateKey(today)}
                                        max={toDateKey(lastDay)}
                                        onChange={(event) =>
                                            event.target.value &&
                                            setDay(event.target.value)
                                        }
                                    />
                                </label>
                            )}
                        </div>

                        <div className="add-plan-group">
                            <span className="add-plan-label" id="add-plan-slot">
                                Meal
                            </span>
                            <div
                                className="add-plan-chips"
                                role="group"
                                aria-labelledby="add-plan-slot"
                            >
                                {profile.mealSlots.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="add-plan-chip"
                                        aria-pressed={item.id === slot}
                                        onClick={() => setSlot(item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {status === 'limit' && (
                            <UpgradeNotice
                                feature="Saved meal limit reached"
                                description={`Your plan keeps up to ${limits.savedMeals} saved meals. Upgrade for unlimited, or delete one you no longer need.`}
                                compact
                            />
                        )}

                        {status === 'error' && (
                            <p className="add-plan-error" role="alert">
                                Could not add this meal to your plan. Please try
                                again.
                            </p>
                        )}

                        <div className="add-plan-actions">
                            <button
                                type="button"
                                className="add-plan-secondary"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="add-plan-primary"
                                onClick={handleAdd}
                                disabled={!slot || status === 'adding'}
                            >
                                {status === 'adding'
                                    ? 'Adding…'
                                    : 'Add to plan'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>,
        document.body,
    );
}

export default AddToPlanSheet;
