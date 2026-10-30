import { useEffect, useState } from 'react';
import type { JournalEntry } from '../shared/types/journal';
import LoadingSpinner from './components/LoadingSpinner';
import MealMicronutrients from './meal-generator/components/MealMicronutrients';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import DailyMacros from './journal/DailyMacros';
import { localDateValue } from './journal/nutrition';
import { totalNutrition } from './utils/nutrition';
import { getJournalEntries } from './services/journalService';
import './components/SavedCollection.css';
import './MyJournal.css';

export default function MyJournal() {
    const [day, setDay] = useState(() => localDateValue());
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{
        day: string;
        entries: JournalEntry[];
        error?: string;
    }>();
    useEffect(() => {
        let active = true;
        getJournalEntries(day)
            .then((entries) => {
                if (active) setResult({ day, entries });
            })
            .catch(() => {
                if (active)
                    setResult({
                        day,
                        entries: [],
                        error: 'Could not load your journal. Please try again.',
                    });
            });
        return () => {
            active = false;
        };
    }, [day, attempt]);
    const current = result?.day === day ? result : undefined;
    const entries = current?.entries ?? [];
    const ingredients = entries.flatMap((entry) => entry.ingredients);
    return (
        <section
            className="my-journal saved-collection"
            aria-labelledby="my-journal-heading"
        >
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <h1 id="my-journal-heading">My Day</h1>
                </div>
                <p>Your day in food, at a glance.</p>
                <label className="journal-date">
                    Date
                    <input
                        type="date"
                        aria-label="Journal date"
                        value={day}
                        onChange={(event) => {
                            if (event.target.value) setDay(event.target.value);
                        }}
                    />
                </label>
            </header>
            {!current ? (
                <div className="journal-loading" role="status">
                    <LoadingSpinner />
                    Loading your journal…
                </div>
            ) : current.error ? (
                <div className="journal-error" role="alert">
                    <p>{current.error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setResult(undefined);
                            setAttempt((value) => value + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    <DailyMacros ingredients={ingredients} />
                    <MealMicronutrients ingredients={ingredients} scope="day" />
                    <section
                        className="journal-section journal-foods"
                        aria-labelledby="journal-foods-heading"
                    >
                        <h2 id="journal-foods-heading">Food journal</h2>
                        {entries.length ? (
                            <ol className="journal-entries">
                                {entries.map((entry) => {
                                    const totals = totalNutrition(
                                        entry.ingredients,
                                    );
                                    return (
                                        <li
                                            className="journal-entry"
                                            key={entry.id}
                                        >
                                            <div className="journal-entry-heading">
                                                <time dateTime={entry.eatenAt}>
                                                    {new Date(
                                                        entry.eatenAt,
                                                    ).toLocaleTimeString(
                                                        undefined,
                                                        {
                                                            hour: 'numeric',
                                                            minute: '2-digit',
                                                        },
                                                    )}
                                                </time>
                                                <h3>{entry.mealName}</h3>
                                            </div>
                                            <ul className="journal-entry-foods">
                                                {entry.ingredients.map(
                                                    (ingredient, index) => (
                                                        <li
                                                            key={`${ingredient.name}-${index}`}
                                                        >
                                                            <IngredientThumbnail
                                                                name={
                                                                    ingredient.name
                                                                }
                                                            />
                                                            <span>
                                                                {
                                                                    ingredient.name
                                                                }
                                                            </span>
                                                            <strong>
                                                                {Number(
                                                                    ingredient.weight.toFixed(
                                                                        1,
                                                                    ),
                                                                )}{' '}
                                                                g
                                                            </strong>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                            <p className="journal-entry-total">
                                                <strong>Total:</strong>{' '}
                                                {Math.round(totals.calories)}{' '}
                                                kcal ·{' '}
                                                {Number(
                                                    totals.protein.toFixed(1),
                                                )}{' '}
                                                g protein ·{' '}
                                                {Number(
                                                    totals.carbohydrate.toFixed(
                                                        1,
                                                    ),
                                                )}{' '}
                                                g carbs ·{' '}
                                                {Number(totals.fat.toFixed(1))}{' '}
                                                g fat
                                            </p>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <div className="saved-collection-empty">
                                <p className="saved-collection-empty-title">
                                    No food logged for this day
                                </p>
                                <p className="saved-collection-empty-hint">
                                    Use the “Add to My Day” icon on a meal
                                    result or saved meal to record what you ate.
                                </p>
                            </div>
                        )}
                    </section>
                </>
            )}
        </section>
    );
}
