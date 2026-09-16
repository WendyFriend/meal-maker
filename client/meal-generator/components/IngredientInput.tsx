import { useEffect, useRef, useState } from 'react';
import './IngredientInput.css';
import deleteIcon from '../../assets/icons/delete.svg';

type IngredientInputProps = {
    ingredients: string[];
    onChange: (ingredients: string[]) => void;
    removeIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
};

function IngredientInput({
    ingredients,
    onChange,
    removeIngredient,
    onIngredientClick,
}: IngredientInputProps) {
    const [input, setInput] = useState('');

    // Ingredient currently in delete mode.
    const [selectedIngredient, setSelectedIngredient] = useState<string | null>(
        null,
    );

    // Ingredient currently playing the deletion animation.
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

    // duplicate ingredient message
    const [duplicateMessage, setDuplicateMessage] = useState<string | null>(
        null,
    );
    const [isDuplicateMessageHiding, setIsDuplicateMessageHiding] =
        useState(false);

    const duplicateMessageTimer = useRef<number | null>(null);
    const duplicateMessageHideTimer = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (longPressTimer.current !== null) {
                window.clearTimeout(longPressTimer.current);
            }

            if (duplicateMessageTimer.current !== null) {
                window.clearTimeout(duplicateMessageTimer.current);
            }

            if (duplicateMessageHideTimer.current !== null) {
                window.clearTimeout(duplicateMessageHideTimer.current);
            }
        };
    }, []);

    function showDuplicateMessage(ingredient: string) {
        if (duplicateMessageTimer.current !== null) {
            window.clearTimeout(duplicateMessageTimer.current);
        }

        if (duplicateMessageHideTimer.current !== null) {
            window.clearTimeout(duplicateMessageHideTimer.current);
        }

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

    function clearLongPressTimer() {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }

    function handlePointerDown(ingredient: string) {
        clearLongPressTimer();

        didLongPress.current = false;

        // If we're already in delete mode, tapping an ingredient
        // simply exits delete mode.
        if (selectedIngredient !== null) {
            dismissingDeleteMode.current = true;
            setSelectedIngredient(null);
            return;
        }

        longPressTimer.current = window.setTimeout(() => {
            didLongPress.current = true;
            setSelectedIngredient(ingredient);
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
        setSelectedIngredient(null);
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

    function handleDocumentPointerDown(event: PointerEvent) {
        if (selectedIngredient === null) {
            return;
        }

        const target = event.target as HTMLElement;

        // The delete button handles its own interaction.
        if (target.closest('.ingredient-chip-delete')) {
            return;
        }

        // Tapping anywhere outside the ingredient chip area
        // exits delete mode.
        if (!target.closest('.ingredient-chip-wrapper')) {
            setSelectedIngredient(null);
        }
    }

    useEffect(() => {
        document.addEventListener('pointerdown', handleDocumentPointerDown);

        return () => {
            document.removeEventListener(
                'pointerdown',
                handleDocumentPointerDown,
            );
        };
    }, [selectedIngredient]);

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();

        const ingredient = input.trim();

        if (!ingredient) {
            return;
        }

        const isDuplicate = ingredients.some(
            (current) => current.toLowerCase() === ingredient.toLowerCase(),
        );

        if (isDuplicate) {
            setInput('');
            showDuplicateMessage(ingredient);
            return;
        }

        onChange([...ingredients, ingredient]);
        setInput('');
    }

    return (
        <div className="ingredient-input">
            <h2>Ingredients</h2>

            <div
                className={`ingredient-chips ${
                    ingredients.length === 0 ? 'ingredient-chips-empty' : ''
                }`}
            >
                {ingredients.map((ingredient, index) => {
                    const isSelected = selectedIngredient === ingredient;
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

            <div className="ingredient-input-field">
                <input
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    enterKeyHint="done"
                    placeholder="Add an ingredient..."
                />
            </div>

            {duplicateMessage && (
                <>
                    <div
                        className={`ingredient-duplicate-backdrop ${
                            isDuplicateMessageHiding
                                ? ''
                                : 'ingredient-duplicate-backdrop-visible'
                        }`}
                    />

                    <div
                        className={`ingredient-duplicate-message ${
                            isDuplicateMessageHiding
                                ? 'ingredient-duplicate-message-hiding'
                                : 'ingredient-duplicate-message-visible'
                        }`}
                    >
                        {duplicateMessage}
                    </div>
                </>
            )}
        </div>
    );
}

export default IngredientInput;
