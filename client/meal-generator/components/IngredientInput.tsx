import { createPortal } from 'react-dom';
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import type { MealPhoto } from '../mealPhotos';
import ComingSoonDialog from '../../components/ComingSoonDialog';
import FavouriteIngredientsSheet from './FavouriteIngredientsSheet';
import IngredientPhotoScan from './IngredientPhotoScan';
import SavedMark from '../../components/SavedMark';
import { revealAboveKeyboard } from '../../utils/revealAboveKeyboard';
import './IngredientInput.css';
import './MealFormField.css';
import {
    normalizeIngredientName,
    rankByCloseness,
} from '../../utils/Ingredient';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import { commonQuickAddIngredients } from './commonQuickAddIngredients';
import { useNutritionLabFoodSearch } from '../../hooks/useNutritionLabFoodSearch';
import LoadingSpinner from '../../components/LoadingSpinner';
import { ingredientDraftFromFoodSearch } from '../../services/foodSearchService';

const commonSearchIngredients = Object.values(commonQuickAddIngredients).flat();
type IngredientSuggestion = {
    key: string;
    name: string;
    nutrition?: IngredientInfo;
};

type IngredientInputProps = {
    ingredients: string[];
    savedIngredients: UserIngredient[];
    onChange: (ingredients: string[]) => void;
    onIngredientNutritionSelected?: (
        name: string,
        nutrition: IngredientInfo,
    ) => void;
    removeIngredient?: (ingredient: string) => void;
    onPhotosChange?: Dispatch<SetStateAction<MealPhoto[]>>;
};

/**
 * With an on-screen keyboard, glide the field up under the header so the
 * chips below it stay in view while typing.
 */
function moveFieldUp(field: HTMLInputElement) {
    if (window.matchMedia?.('(pointer: coarse) and (max-width: 640px)').matches)
        revealAboveKeyboard(field, 0, 'top');
}

function IngredientInput({
    ingredients,
    savedIngredients,
    onChange,
    onIngredientNutritionSelected,
    onPhotosChange,
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
    const [comingSoon, setComingSoon] = useState<'voice'>();
    // Each tap on Photo starts a new scan (a showing result toast is replaced);
    // 0 means closed. Disabled while a photo is read.
    const [photoScan, setPhotoScan] = useState(0);
    const [scanningPhoto, setScanningPhoto] = useState(false);

    // Keyboard navigation: index of the highlighted row in the dropdown,
    // or -1 when nothing is highlighted. The custom entry precedes matches.
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const duplicateMessageTimer = useRef<number | null>(null);
    const duplicateMessageHideTimer = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const ingredientInputRef = useRef<HTMLDivElement>(null);

    const normalizedInput = normalizeIngredientName(input);
    const {
        foods: nutritionLabFoods,
        loading: searchingNutritionLab,
        error: nutritionLabError,
    } = useNutritionLabFoodSearch(input, showSuggestions);
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
    // Saved, curated and Nutrition Lab results together, closest first, so
    // "Pumpkin, raw" comes before a curated "Pumpkin seeds".
    const suggestions: IngredientSuggestion[] = rankByCloseness(
        [
            ...matchingIngredients.slice(0, 6),
            ...nutritionLabFoods
                // Nutrition Lab already matched and ranked these for what was
                // typed (word order, plurals, typos), so only drop duplicates.
                .filter((food) => {
                    const key = normalizeIngredientName(food.name);
                    if (seenSuggestions.has(key)) return false;
                    seenSuggestions.add(key);
                    return true;
                })
                .slice(0, 6)
                .map((food) => ({
                    key: `nutrition-lab:${food.fdcId}`,
                    name: food.name,
                    nutrition: ingredientDraftFromFoodSearch(food),
                })),
        ],
        input,
        ({ name }) => name,
    );

    const exactMatch = suggestions.find(
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

    function addIngredient(
        name: string,
        focusSearch = true,
        nutrition?: IngredientInfo,
    ) {
        const ingredient = name.trim();

        if (!ingredient) return;

        if (isDuplicate(ingredient)) {
            showDuplicateFeedback(ingredient);
            return;
        }

        setInput('');
        setShowSuggestions(false);
        onChange([...ingredients, ingredient]);
        if (nutrition) onIngredientNutritionSelected?.(ingredient, nutrition);
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
                        onFocus={(event) => {
                            window.clearTimeout(blurTimer.current ?? undefined);
                            setShowSuggestions(true);
                            moveFieldUp(event.currentTarget);
                        }}
                        // Android can hide the keyboard while the field keeps
                        // focus; tapping it again brings the keyboard back.
                        onClick={(event) => moveFieldUp(event.currentTarget)}
                        onBlur={() => {
                            window.clearTimeout(blurTimer.current ?? undefined);
                            blurTimer.current = window.setTimeout(() => {
                                setShowSuggestions(false);
                            }, 150);
                        }}
                        onKeyDown={handleKeyDown}
                        enterKeyHint="done"
                        placeholder="Add an ingredient"
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
                    <div
                        className="ingredient-input-actions"
                        role="group"
                        aria-label="More ways to add ingredients"
                    >
                        <button
                            type="button"
                            className="ingredient-input-action"
                            aria-label="Voice"
                            title="Add by voice"
                            onClick={() => setComingSoon('voice')}
                        >
                            <svg viewBox="0 0 24 24">
                                <rect
                                    x="9"
                                    y="3"
                                    width="6"
                                    height="12"
                                    rx="3"
                                />
                                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="ingredient-input-action"
                            aria-label="Photo"
                            title="Add from a photo"
                            disabled={scanningPhoto}
                            onClick={() => setPhotoScan((scan) => scan + 1)}
                        >
                            <svg viewBox="0 0 24 24">
                                <path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8Z" />
                                <circle cx="12" cy="13" r="3.5" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="ingredient-input-action"
                            aria-label="Favourites"
                            title="Add from favourites"
                            onClick={() => setFavouritesOpen(true)}
                        >
                            <svg viewBox="0 0 24 24">
                                <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68-4.13-4.02 5.7-.83L12 3.6Z" />
                            </svg>
                        </button>
                    </div>
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
                            const saved = ingredient.key.startsWith('saved:');
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
                                    aria-label={
                                        saved
                                            ? `${ingredient.name}, saved${added ? ', added' : ''}`
                                            : undefined
                                    }
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
                                        addIngredient(
                                            ingredient.name,
                                            true,
                                            ingredient.nutrition,
                                        )
                                    }
                                >
                                    <span
                                        className="ingredient-suggestion-name"
                                        title={ingredient.name}
                                    >
                                        {ingredient.name}
                                    </span>

                                    {added && (
                                        <span className="ingredient-suggestion-added-badge">
                                            Added
                                        </span>
                                    )}
                                    {saved && <SavedMark trailing />}
                                </button>
                            );
                        })}

                        {searchingNutritionLab && (
                            <div
                                className="ingredient-search-status"
                                role="status"
                                aria-label="Searching ingredients"
                            >
                                <LoadingSpinner size="small" />
                            </div>
                        )}
                        {nutritionLabError && (
                            <div
                                className="ingredient-search-status ingredient-search-error"
                                role="status"
                            >
                                Nutrition Lab is unavailable. You can still add
                                this ingredient.
                            </div>
                        )}

                        {suggestions.length === 0 && !canAddCustom && (
                            <div className="ingredient-suggestion-empty">
                                Already added
                            </div>
                        )}
                    </div>
                )}
            </div>

            {comingSoon && (
                <ComingSoonDialog
                    message="Voice input is coming soon"
                    onClose={() => setComingSoon(undefined)}
                />
            )}

            {photoScan > 0 && (
                <IngredientPhotoScan
                    key={photoScan}
                    ingredients={ingredients}
                    onChange={onChange}
                    onIngredientNutritionSelected={
                        onIngredientNutritionSelected
                    }
                    onScanningChange={setScanningPhoto}
                    onPhotosChange={onPhotosChange}
                    onClose={() => setPhotoScan(0)}
                />
            )}

            {favouritesOpen && (
                <FavouriteIngredientsSheet
                    ingredients={ingredients}
                    savedIngredients={savedIngredients}
                    onChange={onChange}
                    onClose={() => setFavouritesOpen(false)}
                />
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
