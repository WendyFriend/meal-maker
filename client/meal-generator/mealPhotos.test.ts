import { expect, it } from 'vitest';
import type { IngredientInfo } from '../../shared/types/types';
import { withCorrectedPhotoName, type MealPhoto } from './mealPhotos';

const photos: MealPhoto[] = [
    { id: '1', src: '', ingredients: ['red pepper'], scanning: false },
];

function picked(fdcId: number, resolvedName: string) {
    return {
        name: 'red pepper',
        resolvedName,
        nutritionSource: { fdcId },
    } as IngredientInfo;
}

const context = {
    currentName: 'red pepper',
    previousFdcId: 1,
    ingredients: ['Tofu', 'red pepper'],
    photos,
};

it('names a photo food after the food it was corrected to', () => {
    expect(
        withCorrectedPhotoName(picked(2, 'Tomatoes, raw'), context).name,
    ).toBe('Tomatoes, raw');
});

it('keeps the name when the food stays the same', () => {
    expect(
        withCorrectedPhotoName(picked(1, 'Peppers, sweet, red'), context).name,
    ).toBe('red pepper');
});

it('keeps a typed chip’s name', () => {
    expect(
        withCorrectedPhotoName(picked(2, 'Tomatoes, raw'), {
            ...context,
            photos: [],
        }).name,
    ).toBe('red pepper');
});

it('keeps the name when another chip already has the new one', () => {
    expect(withCorrectedPhotoName(picked(2, 'Tofu'), context).name).toBe(
        'red pepper',
    );
});
