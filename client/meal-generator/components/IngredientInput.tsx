import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import './IngredientInput.css';
import './MealFormField.css';
import QuickAddIngredientPicker from './QuickAddIngredientPicker';
import DietSelector from './DietSelector';
import { describeDietConflicts, getDietConflicts } from '../../utils/diet';
import { normalizeIngredientName } from '../../utils/Ingredient';
import { useNutritionSearch } from '../../hooks/useNutritionSearch';
import type {
    DietaryPreference,
    UserIngredient,
} from '../../../shared/types/types';

type IngredientInputProps = {
    ingredients: string[];
    savedIngredients: UserIngredient[];
    onChange: (ingredients: string[]) => void;
    removeIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
    // Diet chosen before picking ingredients; shown only with onDietaryChange.
    dietary?: DietaryPreference[];
    onDietaryChange?: (dietary: DietaryPreference[]) => void;
};

// "Chicken", "Chicken and Salmon", "Chicken, Salmon and Ham"
function formatList(items: string[]) {
    return items.length <= 1
        ? (items[0] ?? '')
        : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function IngredientInput({
    ingredients,
    savedIngredients,
    onChange,
    removeIngredient,
    onIngredientClick,
    dietary = [],
    onDietaryChange,
}: IngredientInputProps) {
    const [input, setInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [deletingIngredient, setDeletingIngredient] = useState<string | null>(
        null,
    );

    const [duplicateMessage, setDuplicateMessage] = useState<string | null>(
        null,
    );
    const [isDuplicateMessageHiding, setIsDuplicateMessageHiding] =
        useState(false);

    // Keyboard navigation: index of the highlighted row in the dropdown,
    // or -1 when nothing is highlighted. Rows are the suggestions, followed
    // by the custom "+ add" row when it is shown.
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const duplicateMessageTimer = useRef<number | null>(null);
    const duplicateMessageHideTimer = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const normalizedInput = normalizeIngredientName(input);
    const selectedNames = new Set(ingredients.map(normalizeIngredientName));

    function isDuplicate(name: string) {
        return selectedNames.has(normalizeIngredientName(name));
    }

    const conflictingIngredients = ingredients.filter(
        (ingredient) => getDietConflicts(ingredient, dietary).length > 0,
    );

    function renderDietTag(name: string) {
        const conflicts = getDietConflicts(name, dietary);

        return conflicts.length > 0 ? (
            <span className="ingredient-suggestion-diet">
                {describeDietConflicts(conflicts)}
            </span>
        ) : null;
    }

    const suggestions =
        normalizedInput.length === 0
            ? []
            : savedIngredients
                  .filter((ingredient) =>
                      normalizeIngredientName(ingredient.name).includes(
                          normalizedInput,
                      ),
                  )
                  .slice(0, 6);

    const exactMatch = savedIngredients.find(
        (ingredient) =>
            normalizeIngredientName(ingredient.name) === normalizedInput,
    );

    const canAddCustom =
        normalizedInput.length > 0 && !exactMatch && !isDuplicate(input);

    // USDA lookup, shown after the saved suggestions. Names the user has
    // already saved are skipped so they don't appear twice.
    const { results: usdaResults, isLoading: isSearchingUsda } =
        useNutritionSearch(input, showSuggestions);
    const savedNames = new Set(
        savedIngredients.map((ingredient) =>
            normalizeIngredientName(ingredient.name),
        ),
    );
    const usdaSuggestions = usdaResults
        .filter(
            (result) => !savedNames.has(normalizeIngredientName(result.name)),
        )
        .slice(0, 6);

    // The dropdown rows the keyboard navigates through: saved suggestions,
    // then USDA suggestions, plus the custom "+ add" row when it is visible.
    const suggestionRows: { key: string; name: string }[] = [
        ...suggestions.map((ingredient) => ({
            key: ingredient.ingredientId,
            name: ingredient.name,
        })),
        ...usdaSuggestions.map((result, index) => ({
            key: `usda-${index}`,
            name: result.name,
        })),
        ...(canAddCustom ? [{ key: 'custom', name: input }] : []),
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

    useEffect(() => clearDuplicateMessageTimers, [clearDuplicateMessageTimers]);

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
            window.requestAnimationFrame(() => inputRef.current?.focus());
        }
    }

    function highlightSuggestion(index: number) {
        setHighlightedIndex(index);

        // Keep the highlighted row visible when navigating with the keyboard.
        const rows = document.querySelectorAll('.ingredient-suggestion');
        rows[index]?.scrollIntoView({ block: 'nearest' });
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

        // Prefer the first suggestion that has not been added yet; pressing
        // Enter on an already-added one shows the duplicate feedback instead
        // of re-adding it.
        const addableSuggestion = suggestions.find(
            (suggestion) => !isDuplicate(suggestion.name),
        );

        if (addableSuggestion) {
            addIngredient(addableSuggestion.name);
            return;
        }

        if (canAddCustom) {
            addIngredient(input);
            return;
        }

        if (normalizedInput && isDuplicate(input)) {
            showDuplicateFeedback(input);
        }
    }

    function handleDeleteIngredient(ingredient: string) {
        setDeletingIngredient(ingredient);
    }

    function handleClearAll() {
        setDeletingIngredient(null);
        onChange([]);
    }

    function handleDeleteAnimationEnd(
        event: React.AnimationEvent<HTMLDivElement>,
        ingredient: string,
    ) {
        if (
            event.animationName !== 'ingredient-chip-delete-out' ||
            deletingIngredient !== ingredient
        ) {
            return;
        }

        removeIngredient(ingredient);
        setDeletingIngredient(null);
    }

    return (
        <div className="ingredient-input">
            <div className="meal-step-header">
                <span className="meal-step-number" aria-hidden="true">
                    1
                </span>
                <div className="meal-step-copy">
                    <h3>Choose your ingredients</h3>
                    <p>
                        Search and add what you have. You can also use your
                        saved ingredients.
                    </p>
                </div>
            </div>

            {onDietaryChange && (
                <DietSelector value={dietary} onChange={onDietaryChange} />
            )}

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
                        className="meal-form-field"
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(event) => {
                            setInput(event.target.value);
                            setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => {
                            window.setTimeout(() => {
                                setShowSuggestions(false);
                            }, 150);
                        }}
                        onKeyDown={handleKeyDown}
                        enterKeyHint="done"
                        placeholder="Search for an ingredient..."
                        aria-label="Search or add an ingredient"
                        role="combobox"
                        aria-expanded={
                            showSuggestions && normalizedInput.length > 0
                        }
                        aria-autocomplete="list"
                        aria-controls="ingredient-suggestions-listbox"
                        aria-activedescendant={
                            activeHighlightedIndex >= 0 &&
                            suggestionRows[activeHighlightedIndex]
                                ? `ingredient-option-${
                                      suggestionRows[activeHighlightedIndex].key
                                  }`
                                : undefined
                        }
                    />
                </div>

                {showSuggestions && normalizedInput.length > 0 && (
                    <div
                        className="ingredient-suggestions"
                        role="listbox"
                        id="ingredient-suggestions-listbox"
                    >
                        {suggestions.map((ingredient, index) => {
                            const added = isDuplicate(ingredient.name);
                            const highlighted =
                                index === activeHighlightedIndex;

                            return (
                                <button
                                    key={ingredient.ingredientId}
                                    id={`ingredient-option-${ingredient.ingredientId}`}
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
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        addIngredient(ingredient.name);
                                    }}
                                >
                                    {ingredient.name}

                                    {added ? (
                                        <span className="ingredient-suggestion-added-badge">
                                            Added
                                        </span>
                                    ) : (
                                        renderDietTag(ingredient.name)
                                    )}
                                </button>
                            );
                        })}

                        {(usdaSuggestions.length > 0 || isSearchingUsda) && (
                            <div
                                className="ingredient-suggestion-group"
                                role="presentation"
                            >
                                From USDA
                            </div>
                        )}

                        {isSearchingUsda && (
                            <div
                                className="ingredient-suggestion-loading"
                                role="status"
                            >
                                <span className="inline-loading">
                                    Searching USDA…
                                </span>
                            </div>
                        )}

                        {usdaSuggestions.map((result, usdaIndex) => {
                            const index = suggestions.length + usdaIndex;
                            const added = isDuplicate(result.name);
                            const highlighted =
                                index === activeHighlightedIndex;

                            return (
                                <button
                                    key={`usda-${usdaIndex}`}
                                    id={`ingredient-option-usda-${usdaIndex}`}
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
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        addIngredient(result.name);
                                    }}
                                >
                                    <span>{result.name}</span>

                                    {added ? (
                                        <span className="ingredient-suggestion-added-badge">
                                            Added
                                        </span>
                                    ) : (
                                        (renderDietTag(result.name) ?? (
                                            <span className="ingredient-suggestion-kcal">
                                                {Math.round(
                                                    result.caloriesPer100g,
                                                )}{' '}
                                                kcal
                                            </span>
                                        ))
                                    )}
                                </button>
                            );
                        })}

                        {canAddCustom && (
                            <button
                                type="button"
                                id="ingredient-option-custom"
                                role="option"
                                aria-selected={
                                    activeHighlightedIndex ===
                                    suggestionRows.length - 1
                                }
                                className={`ingredient-suggestion ingredient-suggestion-custom ${
                                    activeHighlightedIndex ===
                                    suggestionRows.length - 1
                                        ? 'ingredient-suggestion-highlighted'
                                        : ''
                                }`}
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    addIngredient(input);
                                }}
                            >
                                <span>+ {input.trim()}</span>
                                <span className="ingredient-enter-hint">↵</span>
                            </button>
                        )}

                        {suggestionRows.length === 0 && (
                            <div className="ingredient-suggestion-empty">
                                Already added
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div
                className={`ingredient-selection-row ${
                    ingredients.length === 0
                        ? 'ingredient-selection-row-empty'
                        : ''
                }`}
            >
                <div className="ingredient-chips">
                    {ingredients.map((ingredient, index) => {
                        const isDeleting = deletingIngredient === ingredient;
                        const conflicts = getDietConflicts(ingredient, dietary);

                        return (
                            <div
                                key={ingredient}
                                className={`ingredient-chip-wrapper ${
                                    isDeleting
                                        ? 'ingredient-chip-wrapper-deleting'
                                        : ''
                                }`}
                                onAnimationEnd={(event) =>
                                    handleDeleteAnimationEnd(event, ingredient)
                                }
                            >
                                <span
                                    className={`ingredient-chip ${
                                        conflicts.length > 0
                                            ? 'ingredient-chip-conflict'
                                            : ''
                                    }`}
                                    title={
                                        conflicts.length > 0
                                            ? describeDietConflicts(conflicts)
                                            : undefined
                                    }
                                >
                                    <button
                                        type="button"
                                        className="ingredient-chip-label"
                                        onClick={() => onIngredientClick(index)}
                                        aria-label={`Edit nutrition for ${ingredient}${
                                            conflicts.length > 0
                                                ? ` (${describeDietConflicts(conflicts).toLowerCase()})`
                                                : ''
                                        }`}
                                        disabled={isDeleting}
                                    >
                                        {ingredient}
                                    </button>
                                    <button
                                        type="button"
                                        className="ingredient-chip-delete"
                                        onClick={() =>
                                            handleDeleteIngredient(ingredient)
                                        }
                                        aria-label={`Remove ${ingredient}`}
                                        disabled={isDeleting}
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
                                            <path d="M6 6l12 12M18 6L6 18" />
                                        </svg>
                                    </button>
                                </span>
                            </div>
                        );
                    })}
                </div>
                {ingredients.length > 0 && (
                    <button
                        type="button"
                        className="ingredient-clear-all-button"
                        onClick={handleClearAll}
                    >
                        Clear all
                    </button>
                )}
            </div>

            {conflictingIngredients.length > 0 && (
                <div className="ingredient-diet-notice" role="status">
                    <p>
                        {formatList(conflictingIngredients)}{' '}
                        {conflictingIngredients.length === 1
                            ? "doesn't"
                            : "don't"}{' '}
                        fit your diet and will be left out of the meal.
                    </p>
                    <button
                        type="button"
                        onClick={() =>
                            conflictingIngredients.forEach(removeIngredient)
                        }
                    >
                        Remove{' '}
                        {conflictingIngredients.length === 1 ? 'it' : 'them'}
                    </button>
                </div>
            )}

            <QuickAddIngredientPicker
                dietary={dietary}
                savedIngredients={savedIngredients}
                selectedIngredients={ingredients}
                onToggleIngredient={(name) => {
                    const selectedName = ingredients.find(
                        (ingredient) =>
                            normalizeIngredientName(ingredient) ===
                            normalizeIngredientName(name),
                    );
                    if (selectedName !== undefined)
                        removeIngredient(selectedName);
                    else addIngredient(name, false);
                }}
            />

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
