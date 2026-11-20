import { normalizeIngredientName } from '../../utils/Ingredient';
import type { MealPhoto } from '../mealPhotos';
import SelectedIngredients from './SelectedIngredients';
import './MealPhotoPage.css';

/**
 * A photo taken with Meal Maker's Photo, full size, with the foods found in
 * it as the same chips as Meal Maker's (as review screens in food-scanning
 * apps do): tapping one opens its nutrition, ✕ takes it out of the meal.
 * Meal Maker itself shows only the photo.
 */
export default function MealPhotoPage({
    photo,
    ingredients,
    isSaved,
    onOpenIngredient,
    onRemoveIngredient,
    onRemovePhoto,
}: {
    photo: MealPhoto;
    /** The meal's ingredients; only the photo's still there are shown. */
    ingredients: string[];
    isSaved: (name: string) => boolean;
    onOpenIngredient: (name: string) => void;
    onRemoveIngredient: (name: string) => void;
    onRemovePhoto: () => void;
}) {
    const own = new Set(photo.ingredients.map(normalizeIngredientName));
    const foods = ingredients.filter((name) =>
        own.has(normalizeIngredientName(name)),
    );

    return (
        <div className="meal-photo-page">
            {/* The golden ratio of the screen's height. The whole photo
                shows; a blurred copy of it fills the rest of the frame. */}
            <div className="meal-photo-page-frame">
                <img
                    className="meal-photo-page-backdrop"
                    src={photo.src}
                    alt=""
                    aria-hidden="true"
                />
                <img className="meal-photo-page-image" src={photo.src} alt="" />
            </div>
            <div className="meal-photo-page-body">
                <h1 className="meal-photo-page-title">
                    Found in this photo
                    <span className="meal-photo-page-count">
                        {foods.length}
                    </span>
                </h1>
                <SelectedIngredients
                    ingredients={foods}
                    label="Foods in this photo"
                    showClearAll={false}
                    removeIngredient={onRemoveIngredient}
                    onIngredientClick={(index) =>
                        onOpenIngredient(foods[index])
                    }
                    onClear={onRemovePhoto}
                    isSaved={isSaved}
                />
            </div>
            {/* Pinned to the bottom of the screen, like a toolbar. */}
            <div className="meal-photo-page-footer">
                <button
                    type="button"
                    className="meal-photo-page-remove"
                    onClick={onRemovePhoto}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
                    </svg>
                    Remove Photo
                </button>
            </div>
        </div>
    );
}
