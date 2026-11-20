import { scanIngredientsRemote } from '../mealmaker/client.js';
import type { MealMakerIngredientScanResponse } from '../mealmaker/types.js';
import { imageFromRequest } from './imageFromRequest.js';
import { photoFailure, retryOnce } from './photoFailure.js';

const nothingFound = {
    status: 422,
    body: {
        message:
            'Couldn’t find any foods. Try a closer photo of the ingredients.',
    },
};

/**
 * The foods Nutrition Lab saw, once each, named as it saw them (e.g.
 * "tomato"), with the matched food's per-100g nutrition when there is one.
 */
export function scannedIngredients(response: MealMakerIngredientScanResponse) {
    const seen = new Set<string>();
    return (response.ingredients ?? []).flatMap(({ said, food }) => {
        const name = said?.trim().replace(/\s+/g, ' ').slice(0, 60) ?? '';
        const key = name.toLowerCase();
        if (name.length < 2 || seen.has(key)) return [];
        seen.add(key);
        return [
            {
                name,
                food: food
                    ? {
                          fdcId: food.fdcId,
                          name: food.name?.trim() || food.description,
                          description: food.description,
                          per100g: food.per100g,
                      }
                    : null,
            },
        ];
    });
}

/** Finds the ingredients in a food photo with Nutrition Lab. */
export async function handleScanIngredients(input: unknown) {
    const image = imageFromRequest(input);
    if (!image)
        return {
            status: 400,
            body: { message: 'Provide a JPEG, PNG or WebP photo.' },
        };
    try {
        const response = await retryOnce(() => scanIngredientsRemote(image));
        const ingredients = response.photoHasFood
            ? scannedIngredients(response)
            : [];
        return ingredients.length
            ? { status: 200, body: { ingredients } }
            : nothingFound;
    } catch (error) {
        return photoFailure(
            error,
            'Could not scan the photo. Please try again.',
        );
    }
}
