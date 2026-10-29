// "Speak your ingredients" panel for the Meal Maker.
//
// Speak (or type) what you want. Once the cook pauses for 1.5 s the words are
// resolved into ingredients from the local database and added to a list, along
// with any amount tied to a food ("100 grams of rice", "500 calories of bread")
// and any whole-meal goal ("600 calories total", "40 grams of protein", "30
// percent protein"). The meal is only generated when "Create my meal" is pressed.
//
// Speech: the mic stays on until its button is tapped again, and each pause
// adds another batch to the list. Typing: the typed text is a draft that
// re-resolves after each pause; Enter (or creating the meal) adds it to the list.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    ParsedIngredient,
    SpokenMealPeriod,
    SpokenQuantity,
    SpokenTarget,
} from '../../../shared/types/spoken';
import type { FixedAmount } from '../../../shared/types/types';
import { parseRecipe } from '../../services/parseRecipeService';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import './SpeakIngredients.css';

export type SpokenIngredient = NonNullable<ParsedIngredient['match']> & {
    fixedAmount?: FixedAmount;
};

export type SpeakIngredientsProps = {
    /**
     * Called when the cook presses "Create my meal", with every matched
     * ingredient (carrying `fixedAmount` when an amount was stated), the
     * whole-meal goals and the meal period.
     */
    onUse: (
        ingredients: SpokenIngredient[],
        targets: SpokenTarget[],
        mealPeriod: SpokenMealPeriod | null,
    ) => void | Promise<void>;
    /** True while the caller is generating, so the panel can show progress. */
    isGenerating?: boolean;
};

/** How long the cook must pause (typing or speaking) before words are resolved. */
export const PAUSE_MS = 1500;

type ListItem = ParsedIngredient & { key: string };

let nextKey = 0;
const withKeys = (items: ParsedIngredient[]): ListItem[] =>
    items.map((item) => ({ ...item, key: `i${nextKey++}` }));

/** Adds a batch to the list; saying a food again updates it rather than repeating it. */
function mergeItems(list: ListItem[], batch: ListItem[]): ListItem[] {
    const next = [...list];
    for (const item of batch) {
        const index = item.match
            ? next.findIndex((existing) => existing.match?.fdcId === item.match?.fdcId)
            : next.findIndex((existing) => !existing.match && existing.said === item.said);
        if (index === -1) {
            next.push(item);
        } else {
            next[index] = { ...item, quantity: item.quantity ?? next[index].quantity };
        }
    }
    return next;
}

/** Adds goals; a newer figure for the same nutrient and unit replaces the older one. */
function mergeTargets(list: SpokenTarget[], batch: SpokenTarget[]): SpokenTarget[] {
    const next = list.filter(
        (old) => !batch.some((t) => t.nutrient === old.nutrient && t.unit === old.unit),
    );
    return [...next, ...batch];
}

export function formatQuantity(quantity: SpokenQuantity): string {
    return quantity.unit === 'g' ? `${quantity.amount} g` : `${quantity.amount} kcal`;
}

export function formatTarget(target: SpokenTarget): string {
    const name = target.nutrient === 'calories' ? '' : ` ${target.nutrient}`;
    const amount =
        target.unit === '%'
            ? `${target.amount}%`
            : target.unit === 'kcal'
              ? `${target.amount} kcal`
              : `${target.amount} ${target.unit}`;
    return target.nutrient === 'calories' ? `${amount} total` : `${amount}${name}`;
}

function certaintyLevel(p: number): 'high' | 'medium' | 'low' {
    if (p >= 0.8) return 'high';
    if (p >= 0.5) return 'medium';
    return 'low';
}

/**
 * Picks a placeholder that fits.
 *
 * A long example is helpful on a wide field and gets cut off in a narrow one, so
 * the short text takes over below the point where the long one stops fitting.
 */
function useNarrowPlaceholder(wide: string, narrow: string): string {
    const [isNarrow, setIsNarrow] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 520,
    );

    useEffect(() => {
        const query = window.matchMedia('(max-width: 520px)');
        const update = () => setIsNarrow(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    return isNarrow ? narrow : wide;
}

export function SpeakIngredients({ onUse, isGenerating = false }: SpeakIngredientsProps) {
    const [text, setText] = useState('');
    // The list so far, plus the typed draft's own (not yet added) resolution.
    const [items, setItems] = useState<ListItem[]>([]);
    const [targets, setTargets] = useState<SpokenTarget[]>([]);
    const [mealPeriod, setMealPeriod] = useState<SpokenMealPeriod | null>(null);
    const [draft, setDraft] = useState<{
        text: string;
        items: ListItem[];
        targets: SpokenTarget[];
        mealPeriod: SpokenMealPeriod | null;
    } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Spoken words are added to the list as soon as they resolve; typed words
    // wait for Enter. Set when the draft came (at least partly) from the mic.
    const fromVoiceRef = useRef(false);
    const textRef = useRef(text);
    textRef.current = text;
    const abortRef = useRef<AbortController | null>(null);

    /** Adds a resolved batch to the list and clears the field. */
    const commit = useCallback(
        (batch: NonNullable<typeof draft>) => {
            setItems((list) => mergeItems(list, batch.items));
            setTargets((list) => mergeTargets(list, batch.targets));
            if (batch.mealPeriod) setMealPeriod(batch.mealPeriod);
            setDraft(null);
            // Only clear the field if nothing new was said or typed meanwhile.
            if (textRef.current.trim() === batch.text) {
                setText('');
                fromVoiceRef.current = false;
            }
        },
        [],
    );

    /**
     * Resolves the field's text. Returns the batch, or null when it failed or
     * was superseded by newer text.
     */
    const resolve = useCallback(async (raw: string) => {
        const trimmed = raw.trim();
        if (trimmed.length < 2) return null;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setBusy(true);
        setError(null);

        try {
            const response = await parseRecipe(trimmed, controller.signal);
            if (controller.signal.aborted) return null;
            if (!response.ok) {
                // An empty message means the request was superseded.
                if (response.message) setError(response.message);
                return null;
            }

            const { ingredients, targets: stated, mealPeriod: period } = response.data;
            if (!ingredients.some((item) => item.match) && !stated.length) {
                setError('Nothing in there matched the nutrition database.');
            }
            const batch = {
                text: trimmed,
                items: withKeys(ingredients),
                targets: stated,
                mealPeriod: period,
            };
            setDraft(batch);
            return batch;
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setBusy(false);
            }
        }
    }, []);

    const listen = useCallback((spoken: string) => {
        fromVoiceRef.current = true;
        setText((current) => (current.trim() ? `${current.trim()}, ${spoken}` : spoken));
    }, []);

    const voice = useVoiceInput({ onTranscript: listen });
    const speaking = voice.status === 'hearing' || voice.status === 'transcribing';

    // Resolve once the cook has paused for PAUSE_MS: no keystrokes, and no
    // speech being heard or transcribed. Spoken batches go straight onto the
    // list so the next sentence starts a new one.
    useEffect(() => {
        const trimmed = text.trim();
        if (trimmed.length < 2 || speaking) return;
        if (draft && draft.text === trimmed) return;

        const timer = window.setTimeout(() => {
            void resolve(trimmed).then((batch) => {
                if (batch && fromVoiceRef.current) commit(batch);
            });
        }, PAUSE_MS);

        return () => window.clearTimeout(timer);
    }, [commit, draft, resolve, speaking, text]);

    /**
     * Adds whatever is in the field to the list now, resolving it first if
     * needed. Returns the batch added, null when the field was empty, or false
     * when it could not be resolved.
     */
    const flushField = useCallback(async () => {
        const trimmed = textRef.current.trim();
        if (trimmed.length < 2) return null;
        const batch = draft && draft.text === trimmed ? draft : await resolve(trimmed);
        if (!batch) return false;
        commit(batch);
        return batch;
    }, [commit, draft, resolve]);

    const create = useCallback(async () => {
        if (voice.status !== 'idle') voice.stop();
        const pending = await flushField();
        if (pending === false) return;

        // The list state has not re-rendered with the flushed batch yet, so
        // merge it here too.
        const finalItems = pending ? mergeItems(items, pending.items) : items;
        const finalTargets = pending ? mergeTargets(targets, pending.targets) : targets;
        const finalPeriod = pending?.mealPeriod ?? mealPeriod;

        const usable = finalItems
            .filter((item) => item.match)
            .map((item) => ({
                ...(item.match as NonNullable<typeof item.match>),
                ...(item.quantity && { fixedAmount: item.quantity }),
            }));
        if (!usable.length) {
            setError('Add at least one ingredient that matched the database.');
            return;
        }

        try {
            await onUse(usable, finalTargets, finalPeriod);
        } catch {
            setError('Could not create that meal. Please try again.');
        }
    }, [draft, flushField, items, mealPeriod, onUse, targets, voice]);

    const listening = voice.status !== 'idle';
    const showDraft = draft !== null && draft.text === text.trim() && !fromVoiceRef.current;
    const shownItems = showDraft ? mergeItems(items, draft.items) : items;
    const draftKeys = new Set(showDraft ? draft.items.map((item) => item.key) : []);
    const shownTargets = showDraft ? mergeTargets(targets, draft.targets) : targets;
    const shownPeriod = (showDraft && draft.mealPeriod) || mealPeriod;
    const canCreate =
        !isGenerating && (shownItems.some((item) => item.match) || text.trim().length >= 2);

    const statusText = isGenerating
        ? 'Writing your recipe'
        : busy
          ? 'Matching your ingredients'
          : voice.status === 'transcribing'
            ? 'Catching that'
            : '';
    const hint =
        !statusText && listening
            ? 'Listening. Pause to add what you said; tap the mic to stop.'
            : '';

    // The long hint truncates in a narrow field, so use a short one there.
    const placeholder = useNarrowPlaceholder(
        'e.g. 100 grams of rice, chicken, 40 grams of protein',
        'Name some ingredients…',
    );

    return (
        <section className="speak" aria-label="Speak your ingredients">
            <div className={`speak-field${listening ? ' is-listening' : ''}`}>
                <svg
                    className="speak-field-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                >
                    <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <path d="M12 18v3" />
                </svg>

                <input
                    type="text"
                    value={text}
                    placeholder={placeholder}
                    aria-label="Ingredients to use"
                    onChange={(event) => {
                        setText(event.target.value);
                        fromVoiceRef.current = false;
                        setError(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void flushField();
                        }
                    }}
                />

                {text.length > 0 && (
                    <button
                        type="button"
                        className="speak-clear"
                        onClick={() => {
                            abortRef.current?.abort();
                            setText('');
                            setDraft(null);
                            setError(null);
                        }}
                        aria-label="Clear"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}

                <button
                    type="button"
                    className={`speak-mic${listening ? ' is-listening' : ''}${
                        voice.status === 'hearing' ? ' is-hearing' : ''
                    }`}
                    onClick={voice.toggle}
                    disabled={!voice.supported}
                    aria-label={listening ? 'Stop listening' : 'Speak your ingredients'}
                    aria-pressed={listening}
                    title={voice.unsupportedReason ?? (listening ? 'Stop listening' : 'Speak')}
                >
                    {voice.status === 'transcribing' ? (
                        <svg className="speak-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                        </svg>
                    ) : listening ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <rect x="7" y="7" width="10" height="10" rx="2" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                            <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
                            <path d="M5 11a7 7 0 0 0 14 0" />
                            <path d="M12 18v3" />
                        </svg>
                    )}
                </button>
            </div>

            {statusText && (
                <p className="speak-status" role="status">
                    <span className="speak-dot" aria-hidden="true" />
                    {statusText}
                    <span className="speak-ellipsis" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                    </span>
                </p>
            )}
            {hint && <p className="speak-hint">{hint}</p>}

            {shownItems.length > 0 && (
                <ul className="speak-list" aria-label="Ingredients for this meal">
                    {shownItems.map((item) => (
                        <li
                            key={item.key}
                            className={`speak-item${draftKeys.has(item.key) ? ' is-draft' : ''}${
                                item.match ? '' : ' is-unmatched'
                            }`}
                        >
                            <span className="speak-item-name">
                                {item.match ? item.match.description : item.said}
                                {item.match &&
                                    item.said.toLowerCase() !== item.match.description.toLowerCase() && (
                                        <span className="speak-item-said">“{item.said}”</span>
                                    )}
                                {!item.match && <span className="speak-item-said">no match</span>}
                            </span>
                            {item.quantity && (
                                <span
                                    className="speak-tag speak-tag-qty"
                                    title="Fixed amount: the other ingredients adjust around it"
                                >
                                    {formatQuantity(item.quantity)}
                                </span>
                            )}
                            {item.match && item.certainty && (
                                <span
                                    className={`speak-tag speak-conf is-${certaintyLevel(item.certainty.p)}`}
                                    title={`Match confidence: ${item.certainty.band}`}
                                >
                                    {Math.round(item.certainty.p * 100)}%
                                </span>
                            )}
                            {!draftKeys.has(item.key) && (
                                <button
                                    type="button"
                                    className="speak-item-remove"
                                    aria-label={`Remove ${item.match?.description ?? item.said}`}
                                    onClick={() =>
                                        setItems((list) => list.filter((other) => other.key !== item.key))
                                    }
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {(shownTargets.length > 0 || shownPeriod) && (
                <div className="speak-used" aria-label="Meal goals">
                    <span className="speak-used-label">Meal</span>
                    {shownPeriod && <span className="speak-chip">{shownPeriod.mealType}</span>}
                    {shownTargets.map((target) => (
                        <span key={`${target.nutrient}:${target.unit}`} className="speak-chip">
                            {formatTarget(target)}
                            <button
                                type="button"
                                className="speak-chip-remove"
                                aria-label={`Remove ${formatTarget(target)}`}
                                onClick={() =>
                                    setTargets((list) =>
                                        list.filter(
                                            (t) => !(t.nutrient === target.nutrient && t.unit === target.unit),
                                        ),
                                    )
                                }
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {voice.unsupportedReason && (
                <p className="speak-hint">{voice.unsupportedReason}</p>
            )}

            {voice.error && (
                <p className="speak-error" role="alert">
                    {voice.error}
                </p>
            )}
            {error && (
                <p className="speak-error" role="alert">
                    {error}
                </p>
            )}

            {(shownItems.length > 0 || text.trim().length >= 2) && (
                <div className="speak-actions">
                    <button
                        type="button"
                        className="speak-reset"
                        onClick={() => {
                            abortRef.current?.abort();
                            setItems([]);
                            setTargets([]);
                            setMealPeriod(null);
                            setDraft(null);
                            setText('');
                            setError(null);
                        }}
                        disabled={isGenerating}
                    >
                        Start over
                    </button>
                    <button
                        type="button"
                        className="speak-create"
                        onClick={() => void create()}
                        disabled={!canCreate}
                    >
                        Create my meal
                    </button>
                </div>
            )}
        </section>
    );
}

export default SpeakIngredients;
