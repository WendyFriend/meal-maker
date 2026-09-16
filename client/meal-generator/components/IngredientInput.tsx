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
    // ingredient selected for showing the delete button
    const [selectedIngredient, setSelectedIngredient] = useState<string | null>(
        null,
    );
    // ingredient currently playing the deletion animation
    const [deletingIngredient, setDeletingIngredient] = useState<string | null>(
        null,
    );

    // timer that is waiting to see whether the user is doing a long press
    const longPressTimer = useRef<number | null>(null);

    // timer for waiting before actually removing the ingredient
    // delete workflow: hide delete button -> mark ingredient as deleting 
    // -> start deleteTimer -> CSS animation for 200ms -> actually remove it
    const deleteTimer = useRef<number | null>(null);

    // Whether the current pointer interaction become a long press
    // (user does a long press -> releases finger -> browser saw a click event -> trigger onClick callback
    // we don't want the onClick callback to be triggered if it's a long press
    const didLongPress = useRef(false);

    useEffect(() => {
        function handleDocumentPointerDown(event: PointerEvent) {
            if (!selectedIngredient) {
                // if there's nothing to close, then stop
                return;
            }

            // find the element that was pressed
            const target = event.target as HTMLElement;

            // check if user pressed inside the selected ingredient
            if (target.closest('.ingredient-chip-wrapper-selected')) {
                return;
            }
            // remove the delete button
            setSelectedIngredient(null);
        }
        // whenever the user presses anywhere on the document, call handleDocumentPointerDown
        document.addEventListener('pointerdown', handleDocumentPointerDown);

        return () => {
            // remove listener when the component is cleaned up
            // so that we don't keep adding document listeners
            document.removeEventListener(
                'pointerdown',
                handleDocumentPointerDown,
            );
        };
        // install the listener whenever selectedIngredient changes
    }, [selectedIngredient]);

    useEffect(() => {
        return () => {
            if (longPressTimer.current !== null) {
                window.clearTimeout(longPressTimer.current);
            }

            if (deleteTimer.current !== null) {
                window.clearTimeout(deleteTimer.current);
            }
        };
    }, []);

    function clearLongPressTimer() {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }

    function handlePointerDown(ingredient: string) {
        clearLongPressTimer();
        didLongPress.current = false;

        // start a 500ms count down, if user releases before 500ms, 
        // calls handlePointerUp() to clear longPressTimer
        longPressTimer.current = window.setTimeout(() => {
            didLongPress.current = true;
            setSelectedIngredient(ingredient);
            longPressTimer.current = null;
        }, 500);
    }

    function handlePointerUp() {
        clearLongPressTimer();
    }

    function handleDeleteIngredient(ingredient: string) {
        setSelectedIngredient(null);
        setDeletingIngredient(ingredient);

        if (deleteTimer.current !== null) {
            window.clearTimeout(deleteTimer.current);
        }

        deleteTimer.current = window.setTimeout(() => {
            removeIngredient(ingredient);
            setDeletingIngredient(null);
            deleteTimer.current = null;
        }, 200);
    }

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
                                    onClick={() => {
                                        if (didLongPress.current) {
                                            didLongPress.current = false;
                                            return;
                                        }
                                        // it's a normal tap, not a long press
                                        onIngredientClick(index);
                                    }}
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
        </div>
    );
}

export default IngredientInput;
