import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { getUserIngredients } from './services/ingredientService';
import { mockPickerEnvironment } from './test/pickerEnvironment';

vi.mock('./auth/useAuth', () => ({
    useAuth: () => ({ user: { id: 'user' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('./services/ingredientService', () => ({
    getUserIngredients: vi.fn(),
    saveUserIngredient: vi.fn(),
    updateUserIngredient: vi.fn(),
    deleteUserIngredient: vi.fn(),
}));
vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn().mockResolvedValue([]),
    saveRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
}));

const spinach = {
    ingredientId: 'spinach',
    name: 'Spinach',
    caloriesPer100g: 23,
    proteinPer100g: 2.9,
    carbohydratePer100g: 3.6,
    fatPer100g: 0.4,
};
const tofu = {
    ingredientId: 'tofu',
    name: 'Tofu',
    caloriesPer100g: 76,
    proteinPer100g: 8,
    carbohydratePer100g: 1.9,
    fatPer100g: 4.8,
};

beforeEach(() => {
    mockPickerEnvironment();
    vi.mocked(getUserIngredients).mockResolvedValue([spinach, tofu]);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

it('uses saved nutrition for quick adds, keeps nutrition edits and search/manual additions in the generation request', async () => {
    const fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
            mealName: 'Spinach and tofu bowl',
            instructions: ['Cook and serve.'],
            ingredients: [{ ...spinach, weight: 100 }],
        }),
    });
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Veggies' }));
    expect(fetch).not.toHaveBeenCalled();
    await user.click(
        await within(
            screen.getByRole('dialog', { name: 'Veggies' }),
        ).findByRole('button', { name: 'Spinach' }),
    );
    await user.keyboard('{Escape}');

    await user.click(
        screen.getByRole('button', { name: 'Edit nutrition for Spinach' }),
    );
    const nutrition = screen.getByRole('dialog', {
        name: 'Ingredient nutrition',
    });
    expect(nutrition.tagName).toBe('DIALOG');
    expect(nutrition).toHaveClass('ingredient-nutrition-sheet');
    expect(document.body.style.overflow).toBe('hidden');
    expect(
        within(nutrition).getByRole('heading', { name: 'Spinach' }),
    ).toBeVisible();
    expect(within(nutrition).getByRole('table')).toBeInTheDocument();
    expect(
        within(nutrition).getByRole('heading', { name: 'Vitamins & minerals' }),
    ).toBeVisible();
    expect(
        within(nutrition).getByRole('heading', { name: 'Preparation tips' }),
    ).toBeVisible();
    await user.click(
        within(nutrition).getByRole('button', {
            name: 'Edit ingredient nutrition',
        }),
    );
    const calories = within(nutrition).getByRole('spinbutton', {
        name: /Calories/,
    });
    await user.clear(calories);
    await user.type(calories, '50');
    await user.click(
        within(nutrition).getByRole('checkbox', {
            name: 'Save to Ingredients',
        }),
    );
    await user.click(within(nutrition).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(
        screen.getByRole('button', { name: 'Edit nutrition for Spinach' }),
    ).toHaveFocus();

    const search = screen.getByRole('combobox');
    await user.type(search, 'Tofu{Enter}');
    await user.type(search, 'Paprika{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    const generationRequests = () =>
        fetch.mock.calls.filter(([url]) => url === '/api/generate-meal');
    await waitFor(() => expect(generationRequests()).toHaveLength(1));
    const [url, request] = generationRequests()[0];
    expect(url).toBe('/api/generate-meal');
    expect(JSON.parse(request.body)).toEqual({
        ingredients: [
            { ...spinach, caloriesPer100g: 50 },
            tofu,
            { name: 'Paprika' },
        ],
        requirements: {},
    });
    expect(
        await screen.findByRole('heading', { name: 'Spinach and tofu bowl' }),
    ).toBeInTheDocument();
});
