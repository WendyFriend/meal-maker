import { useEffect, useId, useRef, useState } from 'react';
import CheckIcon from '../../components/CheckIcon';
import LoadingSpinner from '../../components/LoadingSpinner';
import {
    cachedNutritionLabFoods,
    foodSearchKey,
    searchNutritionLabFoods,
    type FoodSearchResult,
} from '../../services/foodSearchService';
import IngredientThumbnail from './IngredientThumbnail';
import './FoodMatchPicker.css';

const SEARCH_DELAY_MS = 250;

type SearchState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; foods: FoodSearchResult[] }
    | { status: 'failed' };

function known(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Whether a result has the macros a meal needs. */
function hasMacros({ per100g }: FoodSearchResult) {
    return [per100g.kcal, per100g.proteinG, per100g.carbsG, per100g.fatG].every(
        known,
    );
}

/**
 * Lets the user replace a wrong food match ("red rice" matched to white rice)
 * by searching the food database, starting from what they typed.
 */
export default function FoodMatchPicker({
    ingredientName,
    initialQuery = ingredientName,
    notice,
    currentFdcId,
    picking,
    onPick,
}: {
    ingredientName: string;
    /** Starting search, e.g. the name read from a food photo. */
    initialQuery?: string;
    notice?: { text: string; error?: boolean };
    currentFdcId?: number;
    picking: boolean;
    onPick: (food: FoodSearchResult) => void;
}) {
    const [query, setQuery] = useState(initialQuery);
    const [attempt, setAttempt] = useState(0);
    const key = foodSearchKey(query);
    const cached = key.length >= 2 ? cachedNutritionLabFoods(key) : undefined;
    const [result, setResult] = useState<{
        key: string;
        state: SearchState;
    }>();
    const state: SearchState =
        key.length < 2
            ? { status: 'idle' }
            : cached
              ? { status: 'done', foods: cached }
              : result?.key === `${key}:${attempt}`
                ? result.state
                : { status: 'loading' };
    const headingId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
    }, []);

    useEffect(() => {
        if (key.length < 2 || cachedNutritionLabFoods(key)) return;
        const controller = new AbortController();
        const resultKey = `${key}:${attempt}`;
        const timer = window.setTimeout(() => {
            searchNutritionLabFoods(key, controller.signal)
                .then((foods) =>
                    setResult({
                        key: resultKey,
                        state: { status: 'done', foods },
                    }),
                )
                .catch(() => {
                    if (!controller.signal.aborted)
                        setResult({
                            key: resultKey,
                            state: { status: 'failed' },
                        });
                });
        }, SEARCH_DELAY_MS);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [key, attempt]);

    return (
        <section className="food-match-picker" aria-labelledby={headingId}>
            <h4 id={headingId} className="food-match-picker-title">
                Choose the right food
            </h4>
            <p className="food-match-picker-hint">
                Pick the closest match for “{ingredientName}”. Its nutrition
                will replace the current values.
            </p>
            {notice && (
                <p
                    className={`food-match-picker-notice${notice.error ? ' food-match-picker-notice-error' : ''}`}
                    role={notice.error ? 'alert' : 'status'}
                >
                    {notice.text}
                </p>
            )}
            <input
                ref={inputRef}
                type="search"
                className="food-match-picker-search"
                aria-label="Search foods"
                placeholder="Search foods"
                value={query}
                disabled={picking}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                    // Searching is live; Enter must not submit the sheet form.
                    if (event.key === 'Enter') event.preventDefault();
                }}
            />
            {state.status === 'idle' && (
                <p className="food-match-picker-status">
                    Type at least 2 letters.
                </p>
            )}
            {state.status === 'loading' && (
                <p className="food-match-picker-status" role="status">
                    <LoadingSpinner size="small" />
                    Searching…
                </p>
            )}
            {state.status === 'failed' && (
                <p className="food-match-picker-status" role="alert">
                    Couldn’t search foods.{' '}
                    <button
                        type="button"
                        className="food-match-picker-retry"
                        onClick={() => setAttempt((current) => current + 1)}
                    >
                        Try again
                    </button>
                </p>
            )}
            {state.status === 'done' && state.foods.length === 0 && (
                <p className="food-match-picker-status" role="status">
                    No foods found. Try a different name.
                </p>
            )}
            {state.status === 'done' && state.foods.length > 0 && (
                <ul className="food-match-picker-results" aria-busy={picking}>
                    {state.foods.map((food) => {
                        const usable = hasMacros(food);
                        const current = food.fdcId === currentFdcId;
                        return (
                            <li key={food.fdcId}>
                                <button
                                    type="button"
                                    disabled={!usable || picking}
                                    aria-current={current || undefined}
                                    onClick={() => onPick(food)}
                                >
                                    <IngredientThumbnail
                                        name={food.name}
                                        fdcId={food.fdcId}
                                        size={64}
                                    />
                                    <span className="food-match-picker-text">
                                        <span className="food-match-picker-name">
                                            {food.name}
                                        </span>
                                        <span className="food-match-picker-meta">
                                            {usable
                                                ? `${Math.round(food.per100g.kcal!)} kcal · ${food.per100g.proteinG!.toFixed(1)} g protein per 100 g`
                                                : 'No nutrition data'}
                                        </span>
                                    </span>
                                    {current && (
                                        <span
                                            className="food-match-picker-current"
                                            aria-label="Current match"
                                        >
                                            <CheckIcon />
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
