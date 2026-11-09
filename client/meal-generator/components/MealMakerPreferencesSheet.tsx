import { useId, useRef, useState } from 'react';
import SlidingSheet from '../../components/SlidingSheet';
import type { MealPreference } from '../../../shared/types/types';
import MealGoalWheel from './MealGoalWheel';
import './MealMakerPreferencesSheet.css';

const mealPreferences = [
    { id: 'high-protein', label: 'High protein' },
    { id: 'under-25-minutes', label: 'Under 25 mins' },
    { id: 'plant-based', label: 'Plant based' },
    { id: 'low-carb', label: 'Low carb' },
] as const;

type MealMakerPreferencesSheetProps = {
    calories: number | undefined;
    proteinGrams: number | undefined;
    preferences: MealPreference[];
    onCaloriesChange: (value: number | undefined) => void;
    onProteinChange: (value: number | undefined) => void;
    onPreferencesChange: (value: MealPreference[]) => void;
    onClose: () => void;
};

const calorieOptions = [
    { label: 'No preference', value: undefined },
    ...Array.from({ length: 61 }, (_, index) => {
        const value = index * 50;
        return { label: value.toLocaleString(), value };
    }),
];
const proteinOptions = [
    { label: 'No preference', value: undefined },
    ...Array.from({ length: 41 }, (_, index) => {
        const value = index * 5;
        return { label: String(value), value };
    }),
];

export default function MealMakerPreferencesSheet({
    calories,
    proteinGrams,
    preferences,
    onCaloriesChange,
    onProteinChange,
    onPreferencesChange,
    onClose,
}: MealMakerPreferencesSheetProps) {
    const [activeGoal, setActiveGoal] = useState<'calories' | 'protein' | null>(
        null,
    );
    const [draftCalories, setDraftCalories] = useState(calories);
    const [draftProtein, setDraftProtein] = useState(proteinGrams);
    const [draftPreferences, setDraftPreferences] = useState(preferences);
    const draft = useRef({ calories, proteinGrams, preferences });
    const pickerId = useId();
    const caloriesOpen = activeGoal === 'calories';
    const proteinOpen = activeGoal === 'protein';

    function changeCalories(value: number | undefined) {
        draft.current.calories = value;
        setDraftCalories(value);
    }

    function changeProtein(value: number | undefined) {
        draft.current.proteinGrams = value;
        setDraftProtein(value);
    }

    function togglePreference(preference: MealPreference) {
        const next = draft.current.preferences.includes(preference)
            ? draft.current.preferences.filter((item) => item !== preference)
            : [...draft.current.preferences, preference];
        draft.current.preferences = next;
        setDraftPreferences(next);
    }

    function finish() {
        onCaloriesChange(draft.current.calories);
        onProteinChange(draft.current.proteinGrams);
        onPreferencesChange(draft.current.preferences);
        onClose();
    }

    return (
        <SlidingSheet
            id="meal-maker-preferences-dialog"
            className="meal-maker-preferences-sheet"
            labelledBy="meal-maker-preferences-title"
            onClose={finish}
            header={
                <div className="meal-maker-preferences-sheet-heading">
                    <h2 id="meal-maker-preferences-title">More preferences</h2>
                    <button type="button" onClick={finish}>
                        Done
                    </button>
                </div>
            }
        >
            <section
                className="meal-maker-goal-section"
                aria-labelledby="meal-maker-goals-title"
            >
                <div className="meal-maker-section-heading">
                    <h3 id="meal-maker-goals-title">Nutrition goals</h3>
                </div>
                <div className="meal-maker-goal-group">
                    <button
                        className="meal-maker-goal-row"
                        type="button"
                        aria-expanded={caloriesOpen}
                        aria-controls={`${pickerId}-calories`}
                        onClick={() =>
                            setActiveGoal((goal) =>
                                goal === 'calories' ? null : 'calories',
                            )
                        }
                    >
                        <span>Calories</span>
                        <span
                            className="meal-maker-goal-row-value"
                            data-empty={draftCalories === undefined}
                        >
                            {draftCalories === undefined ? (
                                'No preference'
                            ) : (
                                <>
                                    {draftCalories.toLocaleString()}{' '}
                                    <small>kcal</small>
                                </>
                            )}
                        </span>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m7 10 5 5 5-5" />
                        </svg>
                    </button>
                    <div
                        id={`${pickerId}-calories`}
                        className="meal-maker-wheel-panel"
                        data-open={caloriesOpen}
                        role="group"
                        aria-label="Choose calories"
                        aria-hidden={!caloriesOpen}
                        inert={!caloriesOpen}
                    >
                        <div className="meal-maker-wheel-panel-content">
                            <MealGoalWheel
                                label="Calories"
                                options={calorieOptions}
                                initialValue={draftCalories}
                                active={caloriesOpen}
                                onValueChange={changeCalories}
                            />
                            {draftCalories !== undefined && (
                                <span className="meal-maker-wheel-unit">
                                    kcal
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        className="meal-maker-goal-row"
                        type="button"
                        aria-expanded={proteinOpen}
                        aria-controls={`${pickerId}-protein`}
                        onClick={() =>
                            setActiveGoal((goal) =>
                                goal === 'protein' ? null : 'protein',
                            )
                        }
                    >
                        <span>Protein</span>
                        <span
                            className="meal-maker-goal-row-value"
                            data-empty={draftProtein === undefined}
                        >
                            {draftProtein === undefined ? (
                                'No preference'
                            ) : (
                                <>
                                    {draftProtein} <small>g</small>
                                </>
                            )}
                        </span>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m7 10 5 5 5-5" />
                        </svg>
                    </button>
                    <div
                        id={`${pickerId}-protein`}
                        className="meal-maker-wheel-panel"
                        data-open={proteinOpen}
                        role="group"
                        aria-label="Choose protein in grams"
                        aria-hidden={!proteinOpen}
                        inert={!proteinOpen}
                    >
                        <div className="meal-maker-wheel-panel-content">
                            <MealGoalWheel
                                label="Protein"
                                options={proteinOptions}
                                initialValue={draftProtein}
                                active={proteinOpen}
                                onValueChange={changeProtein}
                            />
                            {draftProtein !== undefined && (
                                <span className="meal-maker-wheel-unit">g</span>
                            )}
                        </div>
                    </div>
                </div>
            </section>
            <section
                className="meal-maker-chip-section"
                aria-labelledby="meal-maker-chip-title"
            >
                <h3 id="meal-maker-chip-title">Preferences</h3>
                <div className="meal-maker-preference-chips">
                    {mealPreferences.map(({ id, label }) => {
                        const selected = draftPreferences.includes(id);
                        return (
                            <button
                                type="button"
                                key={id}
                                aria-pressed={selected}
                                className={selected ? 'selected' : ''}
                                onClick={() => togglePreference(id)}
                            >
                                {selected && <span aria-hidden="true">✓</span>}
                                {label}
                            </button>
                        );
                    })}
                </div>
            </section>
        </SlidingSheet>
    );
}
