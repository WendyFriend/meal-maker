import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MyIngredients from './MyIngredients';
import { getIngredientNutrition } from './services/micronutrientService';
import { saveMealGenerator } from './settings/mealGenerator';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import type { UserIngredient } from '../shared/types/types';

vi.mock('./services/micronutrientService', () => ({
    getIngredientNutrition: vi.fn(),
}));

const saved: UserIngredient = {
    ingredientId: 'spinach',
    name: 'Spinach',
    caloriesPer100g: 23,
    proteinPer100g: 2.9,
    carbohydratePer100g: 3.6,
    fatPer100g: 0.4,
    nutritionSource: { fdcId: 168462, description: 'Spinach, raw' },
};

beforeEach(() => {
    mockPickerEnvironment();
    saveMealGenerator('nutrition-lab');
    vi.mocked(getIngredientNutrition).mockReset();
});
afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

it('uses saved food IDs and looks up images for older ingredients', async () => {
    vi.mocked(getIngredientNutrition).mockResolvedValue({
        name: 'Cauliflower, raw',
        nutritionSource: {
            fdcId: 169986,
            description: 'Cauliflower, raw',
        },
    });
    render(
        <MyIngredients
            ingredients={[
                saved,
                {
                    ...saved,
                    ingredientId: 'cauliflower',
                    name: 'Cauliflower, raw',
                    nutritionSource: undefined,
                },
            ]}
            onDeleteMany={vi.fn(async () => [])}
            onAdd={vi.fn()}
            onSaveFromDatabase={vi.fn()}
            onOpen={vi.fn()}
        />,
    );

    expect(
        screen.getByRole('button', { name: 'Spinach' }).querySelector('img'),
    ).toHaveAttribute('src', expect.stringContaining('/168462.webp?size=64'));
    await waitFor(() =>
        expect(
            screen
                .getByRole('button', { name: 'Cauliflower, raw' })
                .querySelector('img'),
        ).toHaveAttribute(
            'src',
            expect.stringContaining('/169986.webp?size=64'),
        ),
    );
    expect(getIngredientNutrition).toHaveBeenCalledOnce();
});
