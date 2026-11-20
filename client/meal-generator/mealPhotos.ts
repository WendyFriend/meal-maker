import type { IngredientInfo } from '../../shared/types/types';
import { normalizeIngredientName } from '../utils/Ingredient';

/** A photo taken with Meal Maker's Photo, shown with the chips it added. */
export type MealPhoto = {
    id: string;
    /** A small JPEG data URL. */
    src: string;
    /** The chips it added; empty while it is being read. */
    ingredients: string[];
    scanning: boolean;
};

/** Keeps photos still being read, or with a chip still in the list. */
export function prunePhotos(photos: MealPhoto[], ingredients: string[]) {
    const names = new Set(ingredients.map(normalizeIngredientName));
    const next = photos.filter(
        (photo) =>
            photo.scanning ||
            photo.ingredients.some((name) =>
                names.has(normalizeIngredientName(name)),
            ),
    );
    return next.length === photos.length ? photos : next;
}

/** Follows a chip's rename, so its photo stays beside it. */
export function renameInPhotos(photos: MealPhoto[], from: string, to: string) {
    const key = normalizeIngredientName(from);
    return photos.map((photo) =>
        photo.ingredients.some((name) => normalizeIngredientName(name) === key)
            ? {
                  ...photo,
                  ingredients: photo.ingredients.map((name) =>
                      normalizeIngredientName(name) === key ? to : name,
                  ),
              }
            : photo,
    );
}

/**
 * Chips keep the name typed, but a photo's food was only named as Nutrition
 * Lab saw it: when its sheet corrects it to another food (search, or a photo
 * of the food), the chip takes that food's name, unless another chip
 * already has it.
 */
export function withCorrectedPhotoName<T extends IngredientInfo>(
    edited: T,
    {
        currentName,
        previousFdcId,
        ingredients,
        photos,
    }: {
        currentName: string | undefined;
        previousFdcId: number | undefined;
        ingredients: string[];
        photos: MealPhoto[];
    },
): T {
    const foodName = edited.resolvedName?.trim();
    const fdcId = edited.nutritionSource?.fdcId;
    if (currentName === undefined || !foodName || fdcId === undefined)
        return edited;
    const key = normalizeIngredientName(currentName);
    const fromPhoto = photos.some((photo) =>
        photo.ingredients.some((name) => normalizeIngredientName(name) === key),
    );
    const newKey = normalizeIngredientName(foodName);
    const taken =
        newKey !== key &&
        ingredients.some((name) => normalizeIngredientName(name) === newKey);
    return fromPhoto && fdcId !== previousFdcId && !taken
        ? { ...edited, name: foodName }
        : edited;
}
