import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MICRONUTRIENTS } from '../../../shared/micronutrients';
import { saveMealGenerator } from '../../settings/mealGenerator';
import IngredientNutritionContent from './IngredientNutritionContent';

const nutrition = {
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbohydratePer100g: 10,
    fatPer100g: 2,
    ...Object.fromEntries(MICRONUTRIENTS.map(({ key }) => [key, 0])),
};

beforeEach(() => saveMealGenerator('nutrition-lab'));
afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

it('uses an existing food id for the nutrition header without another lookup', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(
        <IngredientNutritionContent
            ingredient={{
                ...nutrition,
                name: 'Broccoli',
                nutritionSource: {
                    fdcId: 170379,
                    description: 'Broccoli, raw',
                },
            }}
        />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://mealmaker.brotherk3d.com/api/v1/thumbnails/170379.webp',
    );
    expect(fetch).not.toHaveBeenCalled();
});

it('shares the food lookup between the header image and nutrition details when a saved ingredient has no source id', async () => {
    const fetch = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                nutritionSource: {
                    fdcId: 172475,
                    description: 'Tofu, firm',
                },
                ironPer100g: 2,
            }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const { container } = render(
        <IngredientNutritionContent
            ingredient={{ ...nutrition, name: 'Firm tofu' }}
        />,
    );
    await waitFor(() =>
        expect(container.querySelector('img')).toHaveAttribute(
            'src',
            'https://mealmaker.brotherk3d.com/api/v1/thumbnails/172475.webp',
        ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/ingredient-nutrition');
    expect(fetch.mock.calls[0][1].headers['X-Meal-Generator']).toBe(
        'nutrition-lab',
    );
});

it('shows lookup progress and fills unknown ingredient nutrition from Nutrition Lab', async () => {
    let finishLookup!: (response: Response) => void;
    vi.stubGlobal(
        'fetch',
        vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    finishLookup = resolve;
                }),
        ),
    );
    const onNutritionResolved = vi.fn();
    render(
        <IngredientNutritionContent
            ingredient={{ name: 'Lookup pumpkin' }}
            variant="sheet"
            onNutritionResolved={onNutritionResolved}
        />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
        'Looking up Lookup pumpkin…',
    );
    finishLookup(
        new Response(
            JSON.stringify({
                name: 'Pumpkin, raw',
                caloriesPer100g: 26,
                proteinPer100g: 1,
                carbohydratePer100g: 6.5,
                fatPer100g: 0.1,
                fiberPer100g: 1.5,
                ironPer100g: 0.8,
                nutritionSource: {
                    fdcId: 168448,
                    description: 'Pumpkin, raw',
                },
            }),
        ),
    );

    expect(
        await screen.findByRole('row', { name: /Calories/ }),
    ).toHaveTextContent('26 kcal');
    await waitFor(() =>
        expect(onNutritionResolved).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Lookup pumpkin',
                caloriesPer100g: 26,
                ironPer100g: 0.8,
            }),
        ),
    );
});

it('keeps Ollama-generated ingredients on local images even when Nutrition Lab is selected', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(
        <IngredientNutritionContent
            ingredient={{
                ...nutrition,
                name: 'Rolled oats',
                nutritionSource: { fdcId: 172989, description: 'Oats, dry' },
                thumbnailSource: 'local',
            }}
        />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});

it('does not resolve a Nutrition Lab image when Ollama is selected', () => {
    saveMealGenerator('ollama');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(
        <IngredientNutritionContent
            ingredient={{ ...nutrition, name: 'Pumpkin' }}
        />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});

it('does not retry a generated ingredient whose micronutrients are explicitly unavailable', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(
        <IngredientNutritionContent
            ingredient={{
                name: 'Unmatched generated ingredient',
                caloriesPer100g: 100,
                proteinPer100g: 5,
                carbohydratePer100g: 15,
                fatPer100g: 2,
                thumbnailSource: 'nutrition-lab',
                unavailableMicronutrients: MICRONUTRIENTS.map(({ key }) => key),
            }}
        />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});
