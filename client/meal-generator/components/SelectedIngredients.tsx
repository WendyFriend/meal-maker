import { useLayoutEffect, useRef, useState } from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';
import { SavedName } from '../../components/SavedMark';
import { normalizeIngredientName } from '../../utils/Ingredient';
import type { MealPhoto } from '../mealPhotos';
import './SelectedIngredients.css';

type SelectedIngredientsProps = {
    ingredients: string[];
    /**
     * Shown above the chips, in place of the chips of the foods found in
     * them; tapping one opens it.
     */
    photos?: MealPhoto[];
    onOpenPhoto?: (id: string) => void;
    /** Removes a photo with the foods found in it. */
    onRemovePhoto?: (id: string) => void;
    /** The ✕ that clears every chip (off where it would mean more). */
    showClearAll?: boolean;
    /** Accessible name of the chips. */
    label?: string;
    removeIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
    onClear: () => void;
    /** Marks chips that are in My Ingredients with a ★. */
    isSaved?: (ingredient: string) => boolean;
};

/**
 * A photo taken with Photo, standing in for the foods found in it (their
 * count in the corner); tapping it opens them, and its ✕ removes it with
 * them, like a chip's. While read, a spinner covers it.
 */
function PhotoTile({
    photo,
    count,
    onOpen,
    onRemove,
}: {
    photo: MealPhoto;
    count: number;
    onOpen?: () => void;
    onRemove?: () => void;
}) {
    const [removing, setRemoving] = useState(false);
    const image = <img src={photo.src} alt="" />;
    if (photo.scanning)
        return (
            <span
                className="ingredient-photo-tile ingredient-photo-tile-scanning"
                role="img"
                aria-label="Photo being read"
            >
                {image}
                <LoadingSpinner size="small" tone="inherit" />
            </span>
        );
    const foods = count === 1 ? '1 food' : `${count} foods`;
    return (
        <span
            className={`ingredient-photo-item${removing ? ' ingredient-chip-wrapper-deleting' : ''}`}
            onAnimationEnd={(event) => {
                if (
                    removing &&
                    event.target === event.currentTarget &&
                    event.animationName === 'ingredient-chip-delete-out'
                )
                    onRemove?.();
            }}
        >
            <button
                type="button"
                className="ingredient-photo-tile"
                aria-label={`Photo, ${foods}`}
                title="See foods in this photo"
                onClick={onOpen}
                disabled={removing}
            >
                {image}
                <span className="ingredient-photo-count" aria-hidden="true">
                    {count}
                </span>
            </button>
            {onRemove && (
                <button
                    type="button"
                    className="ingredient-photo-remove"
                    aria-label={`Remove photo and its ${foods}`}
                    title="Remove photo"
                    disabled={removing}
                    onClick={() => {
                        if (
                            window.matchMedia(
                                '(prefers-reduced-motion: reduce)',
                            ).matches
                        )
                            onRemove();
                        else setRemoving(true);
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path d="M7 7l10 10M17 7L7 17" />
                    </svg>
                </button>
            )}
        </span>
    );
}

export default function SelectedIngredients({
    ingredients,
    photos = [],
    onOpenPhoto,
    onRemovePhoto,
    showClearAll = true,
    label = 'Selected ingredient list',
    removeIngredient,
    onIngredientClick,
    onClear,
    isSaved,
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

    // A photo's foods are shown by the photo, not as chips.
    const keys = ingredients.map(normalizeIngredientName);
    const inPhoto = new Set<string>();
    const counts = new Map<string, number>();
    for (const photo of photos) {
        const own = new Set(photo.ingredients.map(normalizeIngredientName));
        for (const key of own) inPhoto.add(key);
        counts.set(photo.id, keys.filter((key) => own.has(key)).length);
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
                aria-label={label}
                tabIndex={0}
            >
                {photos.length > 0 && (
                    <div className="ingredient-photos">
                        {photos.map((photo) => (
                            <PhotoTile
                                key={photo.id}
                                photo={photo}
                                count={counts.get(photo.id) ?? 0}
                                onOpen={() => onOpenPhoto?.(photo.id)}
                                onRemove={
                                    onRemovePhoto
                                        ? () => onRemovePhoto(photo.id)
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                )}
                {ingredients.length === 0 && photos.length === 0 && (
                    <p className="ingredient-chips-empty">
                        Ingredients you add will appear here.
                    </p>
                )}
                {ingredients.map((ingredient, index) => {
                    if (inPhoto.has(keys[index])) return null;
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
                                    aria-label={`Edit nutrition for ${ingredient}${isSaved?.(ingredient) ? ', saved' : ''}`}
                                    disabled={isDeleting}
                                >
                                    <SavedName
                                        name={ingredient}
                                        saved={isSaved?.(ingredient) ?? false}
                                    />
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
                {showClearAll && ingredients.length > 0 && (
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
