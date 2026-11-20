import type { NutritionLabelScan } from '../../shared/types/types';
import type { FoodSearchResult } from './foodSearchService';

const MAX_SIDE = 1600;

/**
 * Shrinks a photo so it uploads quickly and stays under request limits, or
 * to a thumbnail with a smaller `maxSide`.
 */
export function shrinkPhoto(
    dataUrl: string,
    maxSide = MAX_SIDE,
): Promise<string> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(
                1,
                maxSide / Math.max(image.width, image.height),
            );
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            const context = canvas.getContext('2d');
            if (!context) return resolve(dataUrl);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        image.onerror = () => resolve(dataUrl);
        image.src = dataUrl;
    });
}

async function postPhoto<T extends object>(
    path: string,
    photo: string,
    isResult: (body: object) => body is T,
    fallbackMessage: string,
    fields: Record<string, string | undefined> = {},
): Promise<T> {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, image: await shrinkPhoto(photo) }),
    });
    const body = (await response.json().catch(() => ({}))) as
        T | { message?: string };
    if (response.ok && isResult(body)) return body;
    throw new Error(
        ('message' in body &&
            typeof body.message === 'string' &&
            body.message) ||
            fallbackMessage,
    );
}

/**
 * Reads per-100g nutrition values from a photo of a nutrition label, via
 * Nutrition Lab. The food's name, when known, helps it read the label.
 */
export function scanNutritionLabel(
    photo: string,
    name?: string,
): Promise<NutritionLabelScan> {
    return postPhoto(
        '/api/nutrition-label',
        photo,
        (body): body is NutritionLabelScan => 'nutrition' in body,
        'Could not read the label. Please try again.',
        { name: name?.trim() || undefined },
    );
}

/** Names the food in a photo, as a search term for the food database. */
export async function identifyFoodPhoto(photo: string): Promise<string> {
    const { name } = await postPhoto(
        '/api/identify-food',
        photo,
        (body): body is { name: string } =>
            'name' in body && typeof body.name === 'string',
        'Couldn’t recognise the food. Search for it instead.',
    );
    return name;
}

export type ScannedIngredient = {
    /** What Nutrition Lab saw, e.g. "tomato". */
    name: string;
    /** Its best database match, per 100 g, when there is one. */
    food: FoodSearchResult | null;
};

/** Finds the ingredients in a food photo, via Nutrition Lab. */
export async function scanIngredientsPhoto(
    photo: string,
): Promise<ScannedIngredient[]> {
    const { ingredients } = await postPhoto(
        '/api/scan-ingredients',
        photo,
        (body): body is { ingredients: ScannedIngredient[] } =>
            'ingredients' in body && Array.isArray(body.ingredients),
        'Could not scan the photo. Please try again.',
    );
    return ingredients;
}
