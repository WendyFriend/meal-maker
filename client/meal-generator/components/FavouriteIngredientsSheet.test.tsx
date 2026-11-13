import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UserIngredient } from '../../../shared/types/types';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import FavouriteIngredientsSheet from './FavouriteIngredientsSheet';
import IngredientInput from './IngredientInput';
import { getIngredientNutrition } from '../../services/micronutrientService';

vi.mock('../../services/micronutrientService', () => ({
    getIngredientNutrition: vi.fn(),
}));

const savedIngredients: UserIngredient[] = [
    {
        ingredientId: 'saved-spinach',
        name: 'Spinach',
        caloriesPer100g: 23,
        proteinPer100g: 2.9,
        carbohydratePer100g: 3.6,
        fatPer100g: 0.4,
    },
];

beforeEach(() => {
    mockPickerEnvironment();
    vi.mocked(getIngredientNutrition).mockReset();
    vi.mocked(getIngredientNutrition).mockRejectedValue(new Error('No match'));
});
afterEach(() => vi.unstubAllGlobals());

function Example() {
    const [ingredients, setIngredients] = useState<string[]>([]);
    const [open, setOpen] = useState(true);
    return (
        <>
            <output data-testid="selected">{ingredients.join(', ')}</output>
            {open && (
                <FavouriteIngredientsSheet
                    ingredients={ingredients}
                    savedIngredients={savedIngredients}
                    onChange={setIngredients}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

it('uses saved food IDs and resolves older saved ingredients for Nutrition Lab thumbnails', async () => {
    vi.mocked(getIngredientNutrition).mockResolvedValue({
        name: 'Cauliflower, raw',
        nutritionSource: {
            fdcId: 169986,
            description: 'Cauliflower, raw',
        },
    });
    render(
        <FavouriteIngredientsSheet
            ingredients={[]}
            savedIngredients={[
                {
                    ...savedIngredients[0],
                    nutritionSource: {
                        fdcId: 168462,
                        description: 'Spinach, raw',
                    },
                },
                {
                    ...savedIngredients[0],
                    ingredientId: 'saved-cauliflower',
                    name: 'Cauliflower, raw',
                    nutritionSource: undefined,
                },
            ]}
            onChange={vi.fn()}
            onClose={vi.fn()}
        />,
    );

    expect(
        screen.getByRole('button', { name: 'Spinach' }).querySelector('img'),
    ).toHaveAttribute('src', expect.stringContaining('/168462.webp'));
    await waitFor(() =>
        expect(
            screen
                .getByRole('button', { name: 'Cauliflower, raw' })
                .querySelector('img'),
        ).toHaveAttribute('src', expect.stringContaining('/169986.webp')),
    );
    expect(getIngredientNutrition).toHaveBeenCalledOnce();
});

it('opens on saved favourites and keeps the sheet open while adding ingredients', async () => {
    const user = userEvent.setup();
    render(<Example />);

    expect(
        screen.getByRole('dialog', { name: 'Add ingredient' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Favourites' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    expect(
        within(screen.getByRole('group', { name: 'Ingredient categories' }))
            .getAllByRole('button')
            .map((button) => button.textContent),
    ).toEqual(['Favourites', 'Veggies', 'Protein', 'Grains']);
    expect(
        screen.getByRole('heading', { name: 'My ingredients' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Spinach' }));
    expect(screen.getByTestId('selected')).toHaveTextContent('Spinach');
    expect(screen.getByRole('button', { name: 'Spinach' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    expect(
        screen
            .getByRole('button', { name: 'Spinach' })
            .querySelector('.favourite-ingredient-option-state svg'),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('dialog', { name: 'Add ingredient' }),
    ).toBeVisible();
});

it('shows curated category items and searches across all ingredients', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Veggies' }));
    expect(screen.getByRole('button', { name: 'Tomato' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tomato' }));

    await user.click(screen.getByRole('button', { name: 'Protein' }));
    expect(screen.getByRole('button', { name: 'Firm tofu' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Firm tofu' }));

    await user.click(screen.getByRole('button', { name: 'Grains' }));
    expect(
        screen.getByRole('button', { name: 'Brown rice dry' }),
    ).toBeVisible();
    expect(screen.getByTestId('selected')).toHaveTextContent(
        'Tomato, Firm tofu',
    );

    await user.type(
        screen.getByRole('searchbox', { name: 'Search ingredients' }),
        'spinach',
    );
    expect(
        screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Spinach' })).toBeVisible();
    expect(
        screen.queryByRole('button', { name: 'Tomato' }),
    ).not.toBeInTheDocument();
});

it('opens the ingredient sheet from the Favourites search action', async () => {
    const user = userEvent.setup();
    render(
        <IngredientInput
            ingredients={[]}
            savedIngredients={savedIngredients}
            onChange={vi.fn()}
        />,
    );

    await user.click(screen.getByRole('button', { name: 'Favourites' }));
    expect(
        screen.getByRole('dialog', { name: 'Add ingredient' }),
    ).toBeVisible();
    expect(
        screen.getByRole('heading', { name: 'My ingredients' }),
    ).toBeVisible();
});
