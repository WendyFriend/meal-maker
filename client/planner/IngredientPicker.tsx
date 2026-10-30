import { useId, useState } from 'react';
import { useNutritionSearch } from '../hooks/useNutritionSearch';
import { normalizeIngredientName } from '../utils/Ingredient';
import type { UserIngredient } from '../../shared/types/types';

type IngredientPickerProps = {
    // Names already chosen (case-insensitive).
    selected: string[];
    savedIngredients: UserIngredient[];
    onAdd: (name: string) => void;
};

type Suggestion = {
    key: string;
    name: string;
    hint?: string;
    isCustom?: boolean;
};

/* Search box for the planner's recommend tab: your saved ingredients first,
   then USDA foods, or whatever was typed. Chosen ingredients are shown by
   the caller. */
export default function IngredientPicker({
    selected,
    savedIngredients,
    onAdd,
}: IngredientPickerProps) {
    const listId = useId();
    const [input, setInput] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);

    const query = normalizeIngredientName(input);
    const selectedNames = new Set(selected.map(normalizeIngredientName));
    const { results: usdaResults, isLoading } = useNutritionSearch(
        input,
        isOpen,
    );

    const savedMatches = query
        ? savedIngredients
              .filter(
                  (ingredient) =>
                      normalizeIngredientName(ingredient.name).includes(
                          query,
                      ) &&
                      !selectedNames.has(
                          normalizeIngredientName(ingredient.name),
                      ),
              )
              .slice(0, 5)
        : [];
    const savedNames = new Set(
        savedIngredients.map((ingredient) =>
            normalizeIngredientName(ingredient.name),
        ),
    );
    const usdaMatches = usdaResults
        .filter((result) => {
            const name = normalizeIngredientName(result.name);

            return !savedNames.has(name) && !selectedNames.has(name);
        })
        .slice(0, 5);
    const canAddCustom =
        query.length > 0 &&
        !savedNames.has(query) &&
        !selectedNames.has(query) &&
        !usdaMatches.some(
            (result) => normalizeIngredientName(result.name) === query,
        );

    const suggestions: Suggestion[] = [
        ...savedMatches.map((ingredient) => ({
            key: `saved-${ingredient.ingredientId}`,
            name: ingredient.name,
            hint: 'Saved',
        })),
        ...usdaMatches.map((result, index) => ({
            key: `usda-${index}`,
            name: result.name,
            hint: `${Math.round(result.caloriesPer100g)} kcal`,
        })),
        ...(canAddCustom
            ? [{ key: 'custom', name: input.trim(), isCustom: true }]
            : []),
    ];
    const activeIndex = highlighted < suggestions.length ? highlighted : -1;
    const showList = isOpen && query.length > 0;

    function add(name: string) {
        onAdd(name.trim());
        setInput('');
        setHighlighted(-1);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Escape' && showList) {
            // Closes the list only; the sheet keeps its own Escape.
            event.preventDefault();
            setIsOpen(false);
        } else if (event.key === 'ArrowDown' && showList) {
            event.preventDefault();
            setHighlighted(Math.min(activeIndex + 1, suggestions.length - 1));
        } else if (event.key === 'ArrowUp' && showList) {
            event.preventDefault();
            setHighlighted(Math.max(activeIndex - 1, -1));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const choice = suggestions[activeIndex] ?? suggestions[0];

            if (choice) add(choice.name);
        }
    }

    return (
        <div className="planner-picker">
            <div className="planner-picker-control">
                <svg
                    className="planner-picker-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M16.5 16.5L21 21" />
                </svg>
                <input
                    type="text"
                    className="planner-picker-input"
                    value={input}
                    placeholder="Add another ingredient..."
                    aria-label="Search or add an ingredient"
                    role="combobox"
                    aria-expanded={showList}
                    aria-autocomplete="list"
                    aria-controls={listId}
                    aria-activedescendant={
                        activeIndex >= 0
                            ? `${listId}-${suggestions[activeIndex].key}`
                            : undefined
                    }
                    enterKeyHint="done"
                    onChange={(event) => {
                        setInput(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {showList && (
                <div className="planner-picker-list" role="listbox" id={listId}>
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.key}
                            id={`${listId}-${suggestion.key}`}
                            type="button"
                            role="option"
                            aria-selected={index === activeIndex}
                            className={`planner-picker-option${
                                index === activeIndex
                                    ? ' planner-picker-option-active'
                                    : ''
                            }`}
                            onMouseDown={(event) => {
                                // Keep focus in the field while choosing.
                                event.preventDefault();
                                add(suggestion.name);
                            }}
                        >
                            <span>
                                {suggestion.isCustom
                                    ? `+ Add "${suggestion.name}"`
                                    : suggestion.name}
                            </span>
                            {suggestion.hint && (
                                <small>{suggestion.hint}</small>
                            )}
                        </button>
                    ))}
                    {isLoading && (
                        <div className="planner-picker-status" role="status">
                            <span className="inline-loading">
                                Searching...
                            </span>
                        </div>
                    )}
                    {!isLoading && suggestions.length === 0 && (
                        <div className="planner-picker-status">
                            Already added
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
