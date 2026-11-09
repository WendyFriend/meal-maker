import { useLayoutEffect, useRef, useState } from 'react';
import './SelectedIngredients.css';

type SelectedIngredientsProps = {
    ingredients: string[];
    removeIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
    onClear: () => void;
};

export default function SelectedIngredients({
    ingredients,
    removeIngredient,
    onIngredientClick,
    onClear,
}: SelectedIngredientsProps) {
    const chipsRef = useRef<HTMLDivElement>(null);
    const previousCount = useRef(ingredients.length);
    useLayoutEffect(() => {
        const chips = chipsRef.current;
        if (chips && ingredients.length > previousCount.current) {
            // Reveal new chips without scrolling the form or moving focus.
            chips.scrollTop = chips.scrollHeight;
        }
        previousCount.current = ingredients.length;
    }, [ingredients.length]);
    const [deletingIngredient, setDeletingIngredient] = useState<string | null>(
        null,
    );
    function handleDeleteIngredient(ingredient: string) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            removeIngredient(ingredient);
            return;
        }
        setDeletingIngredient(ingredient);
    }

    function handleClearAll() {
        setDeletingIngredient(null);
        onClear();
    }

    function handleDeleteAnimationEnd(
        event: React.AnimationEvent<HTMLDivElement>,
        ingredient: string,
    ) {
        if (
            event.target !== event.currentTarget ||
            event.animationName !== 'ingredient-chip-delete-out' ||
            deletingIngredient !== ingredient
        ) {
            return;
        }

        removeIngredient(ingredient);
        setDeletingIngredient(null);
    }

    return (
        <section
            className="selected-ingredients"
            aria-label="Selected ingredients"
        >
            <div
                className="ingredient-chips"
                ref={chipsRef}
                role="group"
                aria-label="Selected ingredient list"
                tabIndex={0}
            >
                {ingredients.length === 0 && (
                    <p className="ingredient-chips-empty">
                        Ingredients you add will appear here.
                    </p>
                )}
                {ingredients.map((ingredient, index) => {
                    const isDeleting = deletingIngredient === ingredient;

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
                            <span className="ingredient-chip">
                                <button
                                    type="button"
                                    className="ingredient-chip-label"
                                    onClick={() => onIngredientClick(index)}
                                    aria-label={`Edit nutrition for ${ingredient}`}
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
                {ingredients.length > 0 && (
                    <button
                        type="button"
                        className="ingredient-clear-all-button ingredient-clear-all-chip"
                        onClick={handleClearAll}
                        aria-label="Clear all selected ingredients"
                        title="Clear all selected ingredients"
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                )}
            </div>
        </section>
    );
}
