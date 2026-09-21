import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import './IngredientInput.css';
import deleteIcon from '../../assets/icons/delete.svg';
import type { UserIngredient } from '../../../shared/types/types';

type IngredientInputProps = {
    ingredients: string[];
    savedIngredients: UserIngredient[];
    onChange: (ingredients: string[]) => void;
    removeIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
};

function IngredientInput({
    ingredients,
    savedIngredients,
    onChange,
    removeIngredient,
    onIngredientClick,
}: IngredientInputProps) {
    const [input, setInput] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Delete mode
    const [deleteModeIngredient, setDeleteModeIngredient] = useState<
        string | null
    >(null);
    const [deletingIngredient, setDeletingIngredient] = useState<string | null>(
        null,
    );

    // Timer used only to detect a long press.
    const longPressTimer = useRef<number | null>(null);

    // Prevents the click that follows a long press from opening
    // the nutrition dialog.
    const didLongPress = useRef(false);

    // Prevents a click from opening the nutrition dialog when
    // that click is being used to exit delete mode.
    const dismissingDeleteMode = useRef(false);

    // Duplicate message
    const [duplicateMessage, setDuplicateMessage] = useState<string | null>(
        null,
    );
    const [isDuplicateMessageHiding, setIsDuplicateMessageHiding] =
        useState(false);

    const duplicateMessageTimer = useRef<number | null>(null);
    const duplicateMessageHideTimer = useRef<number | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);

    const normalizedInput = input.trim().toLowerCase();

    const suggestions =
        normalizedInput.length === 0
            ? []
            : savedIngredients
                  .filter((ingredient) =>
                      ingredient.name.toLowerCase().includes(normalizedInput),
                  )
                  .slice(0, 6);

    useEffect(() => {
        return () => {
            clearLongPressTimer();
            clearDuplicateMessageTimers();
        };
    }, []);

    useEffect(() => {
        function handleDocumentPointerDown(event: PointerEvent) {
            if (deleteModeIngredient === null) {
                return;
            }

            const target = event.target as HTMLElement;

            if (target.closest('.ingredient-chip-delete')) {
                return;
            }

            if (!target.closest('.ingredient-chip-wrapper')) {
                setDeleteModeIngredient(null);
            }
        }

        document.addEventListener('pointerdown', handleDocumentPointerDown);

        return () => {
            document.removeEventListener(
                'pointerdown',
                handleDocumentPointerDown,
            );
        };
    }, [deleteModeIngredient]);

    function clearLongPressTimer() {
        if (longPressTimer.current === null) {
            return;
        }

        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }

    function clearDuplicateMessageTimers() {
        if (duplicateMessageTimer.current !== null) {
            window.clearTimeout(duplicateMessageTimer.current);
            duplicateMessageTimer.current = null;
        }

        if (duplicateMessageHideTimer.current !== null) {
            window.clearTimeout(duplicateMessageHideTimer.current);
            duplicateMessageHideTimer.current = null;
        }
    }

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

    function isDuplicate(ingredient: string) {
        const normalizedIngredient = ingredient.trim().toLowerCase();

        return ingredients.some(
            (current) => current.toLowerCase() === normalizedIngredient,
        );
    }

    function showDuplicateFeedback(ingredient: string) {
        setInput('');
        setShowSuggestions(false);
        inputRef.current?.blur();

        showDuplicateMessage(ingredient);
    }

    function addIngredient(name: string) {
        const ingredient = name.trim();

        if (!ingredient) {
            return;
        }

        if (isDuplicate(ingredient)) {
            showDuplicateFeedback(ingredient);
            return;
        }

        setInput('');
        setShowSuggestions(false);
        onChange([...ingredients, ingredient]);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        addIngredient(input);
    }

    function handleSuggestionPointerDown(
        event: React.PointerEvent<HTMLDivElement>,
        name: string,
    ) {
        event.preventDefault();

        if (isDuplicate(name)) {
            showDuplicateFeedback(name);
            return;
        }

        setInput('');
        setShowSuggestions(false);
        onChange([...ingredients, name]);
    }

    function handlePointerDown(ingredient: string) {
        clearLongPressTimer();
        didLongPress.current = false;

        // Tapping another ingredient while in delete mode exits delete mode.
        if (deleteModeIngredient !== null) {
            dismissingDeleteMode.current = true;
            setDeleteModeIngredient(null);
            return;
        }

        longPressTimer.current = window.setTimeout(() => {
            didLongPress.current = true;
            setDeleteModeIngredient(ingredient);
            longPressTimer.current = null;
        }, 500);
    }

    function handlePointerUp() {
        clearLongPressTimer();
    }

    function handleIngredientClick(index: number) {
        // A long press can still produce a click event.
        // Do not open the nutrition dialog in that case.
        if (didLongPress.current) {
            didLongPress.current = false;
            return;
        }

        // This click happened because the user tapped an ingredient
        // while delete mode was active. It was only meant to dismiss
        // delete mode.
        if (dismissingDeleteMode.current) {
            dismissingDeleteMode.current = false;
            return;
        }

        onIngredientClick(index);
    }

    function handleDeleteIngredient(ingredient: string) {
        setDeleteModeIngredient(null);
        setDeletingIngredient(ingredient);
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
            <h3>Ingredients</h3>
            <div
                className={`ingredient-chips ${
                    ingredients.length === 0 ? 'ingredient-chips-empty' : ''
                }`}
            >
                {ingredients.map((ingredient, index) => {
                    const isSelected = deleteModeIngredient === ingredient;
                    const isDeleting = deletingIngredient === ingredient;

                    return (
                        <div
                            key={ingredient}
                            className={`ingredient-chip-wrapper ${
                                isSelected
                                    ? 'ingredient-chip-wrapper-selected'
                                    : ''
                            } ${
                                isDeleting
                                    ? 'ingredient-chip-wrapper-deleting'
                                    : ''
                            }`}
                            onPointerDown={() => handlePointerDown(ingredient)}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onAnimationEnd={(event) =>
                                handleDeleteAnimationEnd(event, ingredient)
                            }
                        >
                            {isSelected && (
                                <button
                                    type="button"
                                    className="ingredient-chip-delete"
                                    onPointerDown={(event) =>
                                        event.stopPropagation()
                                    }
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleDeleteIngredient(ingredient);
                                    }}
                                    aria-label={`Remove ${ingredient}`}
                                >
                                    <img
                                        src={deleteIcon}
                                        alt=""
                                        aria-hidden="true"
                                    />
                                </button>
                            )}

                            <span className="ingredient-chip">
                                <button
                                    type="button"
                                    className="ingredient-chip-label"
                                    onClick={() => handleIngredientClick(index)}
                                    aria-label={`Edit nutrition for ${ingredient}`}
                                >
                                    {ingredient}
                                </button>
                            </span>
                        </div>
                    );
                })}
            </div>

            <div
                className={`ingredient-input-field ${
                    duplicateMessage ? 'ingredient-input-field-dimmed' : ''
                }`}
            >
                <input
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
                    placeholder="Add an ingredient..."
                />

                {showSuggestions && suggestions.length > 0 && (
                    <div className="ingredient-suggestions" role="listbox">
                        {suggestions.map((ingredient) => (
                            <div
                                key={ingredient.ingredientId}
                                className="ingredient-suggestion"
                                role="option"
                                onPointerDown={(event) =>
                                    handleSuggestionPointerDown(
                                        event,
                                        ingredient.name,
                                    )
                                }
                            >
                                {ingredient.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>

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
