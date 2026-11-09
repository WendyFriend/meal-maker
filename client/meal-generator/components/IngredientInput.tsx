import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import SlidingSheet from '../../components/SlidingSheet';
import FavouriteIngredientsSheet from './FavouriteIngredientsSheet';
import './IngredientInput.css';
import './MealFormField.css';
import { normalizeIngredientName } from '../../utils/Ingredient';
import type { UserIngredient } from '../../../shared/types/types';
import { commonQuickAddIngredients } from './commonQuickAddIngredients';

const commonSearchIngredients = Object.values(commonQuickAddIngredients).flat();

type IngredientInputProps = {
    ingredients: string[];
    savedIngredients: UserIngredient[];
    onChange: (ingredients: string[]) => void;
    removeIngredient?: (ingredient: string) => void;
};

type SpeechResult = { transcript: string };
type SpeechRecognitionLike = {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult:
        | ((event: { results: ArrayLike<ArrayLike<SpeechResult>> }) => void)
        | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function IngredientInput({
    ingredients,
    savedIngredients,
    onChange,
}: IngredientInputProps) {
    const listboxId = useId();
    const inputId = useId();
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const blurTimer = useRef<number | null>(null);
    const [input, setInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [duplicateMessage, setDuplicateMessage] = useState<string | null>(
        null,
    );
    const [isDuplicateMessageHiding, setIsDuplicateMessageHiding] =
        useState(false);
    const [favouritesOpen, setFavouritesOpen] = useState(false);
    const [photo, setPhoto] = useState<File | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [photoIngredientNames, setPhotoIngredientNames] = useState('');
    const [voiceStatus, setVoiceStatus] = useState('');
    const [isListening, setIsListening] = useState(false);

    // Keyboard navigation: index of the highlighted row in the dropdown,
    // or -1 when nothing is highlighted. The custom entry precedes matches.
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const duplicateMessageTimer = useRef<number | null>(null);
    const duplicateMessageHideTimer = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const photoUrlRef = useRef<string | null>(null);
    const ingredientInputRef = useRef<HTMLDivElement>(null);

    useEffect(
        () => () => {
            if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        },
        [],
    );

    const normalizedInput = normalizeIngredientName(input);
    const selectedNames = new Set(ingredients.map(normalizeIngredientName));

    function isDuplicate(name: string) {
        return selectedNames.has(normalizeIngredientName(name));
    }

    const seenSuggestions = new Set<string>();
    const matchingIngredients =
        normalizedInput.length === 0
            ? []
            : [
                  ...savedIngredients.map((ingredient) => ({
                      key: `saved:${ingredient.ingredientId}`,
                      name: ingredient.name,
                  })),
                  ...commonSearchIngredients.map((ingredient) => ({
                      key: `common:${normalizeIngredientName(ingredient.name)}`,
                      name: ingredient.name,
                  })),
              ].filter(({ name }) => {
                  const normalizedName = normalizeIngredientName(name);
                  if (
                      !normalizedName.includes(normalizedInput) ||
                      seenSuggestions.has(normalizedName)
                  )
                      return false;
                  seenSuggestions.add(normalizedName);
                  return true;
              });
    const suggestions = matchingIngredients.slice(0, 6);

    const exactMatch = matchingIngredients.find(
        ({ name }) => normalizeIngredientName(name) === normalizedInput,
    );

    const canAddCustom =
        normalizedInput.length > 0 && !exactMatch && !isDuplicate(input);

    // Keep the custom entry above partial matches, followed by saved and
    // curated suggestions. The saved record wins when names overlap.
    const suggestionRows: { key: string; name: string }[] = [
        ...(canAddCustom ? [{ key: 'custom', name: input }] : []),
        ...suggestions,
    ];

    // Clamp the highlight inside the list as the query changes; derived
    // during render so a shorter list immediately deselects stale indexes
    // without needing an effect.
    const activeHighlightedIndex =
        highlightedIndex < suggestionRows.length ? highlightedIndex : -1;

    const clearDuplicateMessageTimers = useCallback(() => {
        for (const timer of [
            duplicateMessageTimer,
            duplicateMessageHideTimer,
        ]) {
            window.clearTimeout(timer.current ?? undefined);
            timer.current = null;
        }
    }, []);

    useEffect(
        () => () => {
            clearDuplicateMessageTimers();
            window.clearTimeout(blurTimer.current ?? undefined);
        },
        [clearDuplicateMessageTimers],
    );

    function showDuplicateMessage(ingredient: string) {
        clearDuplicateMessageTimers();

        setDuplicateMessage(`"${ingredient}" is already in your ingredients.`);
        setIsDuplicateMessageHiding(false);

        duplicateMessageTimer.current = window.setTimeout(() => {
            setIsDuplicateMessageHiding(true);

            duplicateMessageHideTimer.current = window.setTimeout(() => {
                setDuplicateMessage(null);
                setIsDuplicateMessageHiding(false);
                duplicateMessageHideTimer.current = null;
            }, 250);
        }, 1500);
    }

    function showDuplicateFeedback(ingredient: string) {
        setInput('');
        setShowSuggestions(false);
        inputRef.current?.blur();

        showDuplicateMessage(ingredient);
    }

    function addIngredient(name: string, focusSearch = true) {
        const ingredient = name.trim();

        if (!ingredient) return;

        if (isDuplicate(ingredient)) {
            showDuplicateFeedback(ingredient);
            return;
        }

        setInput('');
        setShowSuggestions(false);
        onChange([...ingredients, ingredient]);
        // Keep the field ready for the next ingredient.
        if (focusSearch) {
            window.requestAnimationFrame(() =>
                inputRef.current?.focus({ preventScroll: true }),
            );
        }
    }

    function highlightSuggestion(index: number) {
        setHighlightedIndex(index);

        // Keep the highlighted row visible when navigating with the keyboard.
        const rows =
            suggestionsRef.current?.querySelectorAll<HTMLElement>(
                '[role="option"]',
            );
        rows?.[index]?.scrollIntoView({ block: 'nearest' });
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Escape') {
            setShowSuggestions(false);
            setHighlightedIndex(-1);
            return;
        }

        if (showSuggestions && normalizedInput.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                highlightSuggestion(
                    Math.min(
                        activeHighlightedIndex + 1,
                        suggestionRows.length - 1,
                    ),
                );
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                highlightSuggestion(Math.max(activeHighlightedIndex - 1, -1));
                return;
            }
        }

        if (event.key !== 'Enter') return;

        event.preventDefault();

        // If a row is highlighted, Enter commits that exact row — including
        // already-added suggestions, so picking one shows the duplicate
        // feedback instead of silently adding the next addable item.
        const highlightedRow = suggestionRows[activeHighlightedIndex];

        if (highlightedRow) {
            addIngredient(highlightedRow.name);
            return;
        }

        if (exactMatch && !isDuplicate(exactMatch.name)) {
            addIngredient(exactMatch.name);
            return;
        }

        // If there is no custom entry, use the first suggestion that has not
        // already been added.
        if (canAddCustom) {
            addIngredient(input);
            return;
        }

        const addableSuggestion = suggestions.find(
            (suggestion) => !isDuplicate(suggestion.name),
        );

        if (addableSuggestion) {
            addIngredient(addableSuggestion.name);
            return;
        }

        if (normalizedInput && isDuplicate(input)) {
            showDuplicateFeedback(input);
        }
    }

    const suggestionsOpen = showSuggestions && normalizedInput.length > 0;
    const optionId = (key: string) => `${listboxId}-${key}`;

    function startVoiceInput() {
        const speechWindow = window as Window & {
            SpeechRecognition?: SpeechRecognitionConstructor;
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
        };
        const Recognition =
            speechWindow.SpeechRecognition ??
            speechWindow.webkitSpeechRecognition;
        if (!Recognition) {
            setVoiceStatus('Voice input is not supported in this browser.');
            return;
        }

        const recognition = new Recognition();
        recognition.lang = navigator.language || 'en-AU';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = event.results[0]?.[0]?.transcript?.trim();
            if (transcript) {
                setInput(transcript);
                setShowSuggestions(true);
                setVoiceStatus('Voice input added to search.');
                inputRef.current?.focus();
            }
        };
        recognition.onerror = () => {
            setVoiceStatus('Could not hear that. Try again or type instead.');
            setIsListening(false);
        };
        recognition.onend = () => setIsListening(false);
        setVoiceStatus('Listening…');
        setIsListening(true);
        try {
            recognition.start();
        } catch {
            setIsListening(false);
            setVoiceStatus('Could not start voice input. Try again.');
        }
    }

    function addPhotoIngredients() {
        const names = photoIngredientNames
            .split(/[,\n]+/)
            .map((name) => name.trim())
            .filter(Boolean);
        const additions = names.filter(
            (name) =>
                !ingredients.some(
                    (ingredient) =>
                        normalizeIngredientName(ingredient) ===
                        normalizeIngredientName(name),
                ),
        );
        if (additions.length) onChange([...ingredients, ...additions]);
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
        setPhoto(null);
        setPhotoUrl(null);
        setPhotoIngredientNames('');
    }

    function clearPhoto() {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
        setPhoto(null);
        setPhotoUrl(null);
        setPhotoIngredientNames('');
    }

    return (
        <div className="ingredient-input" ref={ingredientInputRef}>
            <div
                className={`ingredient-input-field ${
                    duplicateMessage ? 'ingredient-input-field-dimmed' : ''
                }`}
            >
                <div className="ingredient-input-control">
                    <span className="ingredient-search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                            <circle cx="11" cy="11" r="7" />
                            <path d="M16.5 16.5L21 21" />
                        </svg>
                    </span>

                    <input
                        id={inputId}
                        className="meal-form-field"
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(event) => {
                            setInput(event.target.value);
                            setShowSuggestions(true);
                            setHighlightedIndex(0);
                        }}
                        onFocus={() => {
                            window.clearTimeout(blurTimer.current ?? undefined);
                            setShowSuggestions(true);
                        }}
                        onBlur={() => {
                            window.clearTimeout(blurTimer.current ?? undefined);
                            blurTimer.current = window.setTimeout(() => {
                                setShowSuggestions(false);
                            }, 150);
                        }}
                        onKeyDown={handleKeyDown}
                        enterKeyHint="done"
                        placeholder="Search or add an ingredient"
                        aria-label="Search or add an ingredient"
                        role="combobox"
                        aria-expanded={suggestionsOpen}
                        aria-autocomplete="list"
                        aria-controls={suggestionsOpen ? listboxId : undefined}
                        aria-activedescendant={
                            suggestionsOpen &&
                            activeHighlightedIndex >= 0 &&
                            suggestionRows[activeHighlightedIndex]
                                ? optionId(
                                      suggestionRows[activeHighlightedIndex]
                                          .key,
                                  )
                                : undefined
                        }
                    />
                </div>

                {suggestionsOpen && (
                    <div
                        className="ingredient-suggestions"
                        role="listbox"
                        id={listboxId}
                        ref={suggestionsRef}
                    >
                        {canAddCustom && (
                            <button
                                type="button"
                                id={optionId('custom')}
                                role="option"
                                aria-selected={activeHighlightedIndex === 0}
                                className={`ingredient-suggestion ingredient-suggestion-custom ${
                                    activeHighlightedIndex === 0
                                        ? 'ingredient-suggestion-highlighted'
                                        : ''
                                }`}
                                onPointerDown={(event) =>
                                    event.preventDefault()
                                }
                                onClick={() => addIngredient(input)}
                            >
                                <span>+ {input.trim()}</span>
                                <span className="ingredient-enter-hint">↵</span>
                            </button>
                        )}
                        {suggestions.map((ingredient, index) => {
                            const added = isDuplicate(ingredient.name);
                            const highlighted =
                                index + Number(canAddCustom) ===
                                activeHighlightedIndex;

                            return (
                                <button
                                    key={ingredient.key}
                                    id={optionId(ingredient.key)}
                                    type="button"
                                    role="option"
                                    aria-selected={highlighted}
                                    className={`ingredient-suggestion ${
                                        added
                                            ? 'ingredient-suggestion-added'
                                            : ''
                                    } ${
                                        highlighted
                                            ? 'ingredient-suggestion-highlighted'
                                            : ''
                                    }`}
                                    // Keep search focused, but wait for the completed tap
                                    // before removing the result under the pointer.
                                    onPointerDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() =>
                                        addIngredient(ingredient.name)
                                    }
                                >
                                    {ingredient.name}

                                    {added && (
                                        <span className="ingredient-suggestion-added-badge">
                                            Added
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        {suggestions.length === 0 && !canAddCustom && (
                            <div className="ingredient-suggestion-empty">
                                Already added
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div
                className="meal-maker-action-row"
                role="group"
                aria-label="More ways to add ingredients"
            >
                <button
                    type="button"
                    onClick={startVoiceInput}
                    aria-pressed={isListening}
                >
                    <span
                        className="meal-maker-action-icon meal-maker-action-voice"
                        aria-hidden="true"
                    >
                        <svg viewBox="0 0 24 24">
                            <rect x="9" y="3" width="6" height="12" rx="3" />
                            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
                        </svg>
                    </span>
                    Voice
                </button>
                <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                >
                    <span
                        className="meal-maker-action-icon meal-maker-action-photo"
                        aria-hidden="true"
                    >
                        <svg viewBox="0 0 24 24">
                            <path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8Z" />
                            <circle cx="12" cy="13" r="3.5" />
                        </svg>
                    </span>
                    Photo
                </button>
                <button type="button" onClick={() => setFavouritesOpen(true)}>
                    <span
                        className="meal-maker-action-icon meal-maker-action-favourite"
                        aria-hidden="true"
                    >
                        <svg viewBox="0 0 24 24">
                            <path d="M9.153 5.408C10.42 3.136 11.053 2 12 2s1.58 1.136 2.847 3.408l.327.588c.36.646.54.969.821 1.182.28.213.63.292 1.329.45l.636.144c2.46.557 3.69.835 3.983 1.776.292.94-.546 1.921-2.223 3.882l-.434.507c-.476.557-.715.836-.822 1.18-.107.345-.071.717.001 1.46l.066.677c.253 2.617.38 3.925-.386 4.506-.766.582-1.918.052-4.221-1.009l-.595-.274c-.655-.301-.982-.452-1.329-.452s-.674.151-1.329.452l-.595.274c-2.303 1.061-3.455 1.591-4.221 1.01-.766-.582-.639-1.89-.386-4.507l.066-.677c.072-.743.108-1.115.001-1.46-.107-.344-.346-.623-.822-1.18l-.434-.507C2.603 11.469 1.765 10.489 2.057 9.548c.293-.941 1.523-1.22 3.983-1.776l.636-.144c.699-.158 1.048-.237 1.329-.45.28-.213.46-.536.82-1.182l.328-.588Z" />
                        </svg>
                    </span>
                    Favourites
                </button>
            </div>
            <p className="meal-maker-voice-status" aria-live="polite">
                {voiceStatus}
            </p>
            <input
                ref={photoInputRef}
                className="meal-maker-photo-input"
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Take a photo of food"
                onChange={(event) => {
                    const selectedPhoto = event.currentTarget.files?.[0];
                    if (selectedPhoto) {
                        if (photoUrlRef.current)
                            URL.revokeObjectURL(photoUrlRef.current);
                        const url = URL.createObjectURL(selectedPhoto);
                        photoUrlRef.current = url;
                        setPhotoUrl(url);
                        setPhoto(selectedPhoto);
                    }
                    event.currentTarget.value = '';
                }}
            />

            {favouritesOpen && (
                <FavouriteIngredientsSheet
                    ingredients={ingredients}
                    savedIngredients={savedIngredients}
                    onChange={onChange}
                    onClose={() => setFavouritesOpen(false)}
                />
            )}

            {photo && (
                <SlidingSheet
                    className="meal-maker-photo-sheet"
                    labelledBy="meal-maker-photo-title"
                    onClose={clearPhoto}
                    header={
                        <h2 id="meal-maker-photo-title">Add from a photo</h2>
                    }
                >
                    {photoUrl && (
                        <img
                            className="meal-maker-photo-preview"
                            src={photoUrl}
                            alt="Photo of food"
                        />
                    )}
                    <label
                        className="meal-maker-photo-label"
                        htmlFor="meal-maker-photo-ingredients"
                    >
                        Which ingredients can you see?
                    </label>
                    <textarea
                        id="meal-maker-photo-ingredients"
                        value={photoIngredientNames}
                        onChange={(event) =>
                            setPhotoIngredientNames(event.target.value)
                        }
                        placeholder="For example: tofu, broccoli"
                        rows={2}
                    />
                    <button
                        className="meal-maker-photo-add"
                        type="button"
                        disabled={!photoIngredientNames.trim()}
                        onClick={addPhotoIngredients}
                    >
                        Add ingredients
                    </button>
                </SlidingSheet>
            )}

            {duplicateMessage &&
                createPortal(
                    <div
                        className={`ingredient-duplicate-overlay ${
                            isDuplicateMessageHiding
                                ? ''
                                : 'ingredient-duplicate-overlay-visible'
                        }`}
                    >
                        <div
                            className={`ingredient-duplicate-message ${
                                isDuplicateMessageHiding
                                    ? 'ingredient-duplicate-message-hiding'
                                    : 'ingredient-duplicate-message-visible'
                            }`}
                        >
                            {duplicateMessage}
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}

export default IngredientInput;
