import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { getUserIngredients } from './services/ingredientService';
import { getRecipes, updateRecipe } from './services/recipeService';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import type { Recipe } from '../shared/types/recipe';

vi.mock('./auth/useAuth', () => ({
    useAuth: () => ({ user: { id: 'user' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('./services/ingredientService', () => ({
    getUserIngredients: vi.fn().mockResolvedValue([]),
}));
vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn(),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    saveRecipe: vi.fn(),
    deleteRecipes: vi.fn(),
}));
vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));
afterEach(() => vi.unstubAllGlobals());

it('edits a saved recipe by section and updates the retained My Meals list', async () => {
    mockPickerEnvironment();
    const recipe: Recipe = {
        id: 'meal-1',
        userId: 'user',
        recipeName: 'Tofu bowl',
        ingredients: [
            {
                name: 'Tofu',
                weight: 100,
                caloriesPer100g: 130,
                proteinPer100g: 15,
                fatPer100g: 4,
                carbohydratePer100g: 5.6,
            },
        ],
        instructions: ['Cook: Stir for 2 minutes.'],
    };
    let savedRecipe = recipe;
    vi.mocked(getRecipes).mockImplementation(async () => [savedRecipe]);
    vi.mocked(updateRecipe).mockImplementation(async (_id, value) => {
        savedRecipe = value;
        return value;
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(
        within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
            'button',
            { name: 'My Meals' },
        ),
    );
    await user.click(await screen.findByRole('button', { name: /Tofu bowl/ }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Edit meal' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Log out' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    const weight = screen.getByRole('spinbutton', {
        name: 'Tofu weight in grams',
    });
    await user.clear(weight);
    await user.type(weight, '150');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    await user.click(
        screen.getByRole('button', { name: 'Cancel ingredients changes' }),
    );
    expect(screen.getByText('100 g')).toBeInTheDocument();
    expect(updateRecipe).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() =>
        expect(updateRecipe).toHaveBeenCalledWith(
            'meal-1',
            expect.objectContaining({
                ingredients: [expect.objectContaining({ weight: 105 })],
            }),
        ),
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
        await screen.findByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tofu bowl')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tofu bowl/ }));
    expect(await screen.findByText('105 g')).toBeInTheDocument();
});

it('opens ingredient editing from the right side of the app header', async () => {
    mockPickerEnvironment();
    vi.mocked(getUserIngredients).mockResolvedValueOnce([
        {
            ingredientId: 'tofu',
            name: 'Tofu',
            caloriesPer100g: 130,
            proteinPer100g: 15,
            fatPer100g: 4,
            carbohydratePer100g: 5.6,
        },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(
        within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
            'button',
            { name: 'My Ingredients' },
        ),
    );
    await user.click(await screen.findByRole('button', { name: 'Tofu' }));
    const edit = screen.getByRole('button', { name: 'Edit ingredient' });
    expect(document.querySelector('.page-header')).toContainElement(edit);
    expect(document.querySelector('.ingredient-detail')).not.toContainElement(
        edit,
    );
    await user.click(edit);
    expect(
        screen.getByRole('textbox', { name: 'Ingredient name' }),
    ).toHaveValue('Tofu');
    expect(
        screen.getByRole('button', { name: 'Cancel editing' }),
    ).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel editing' });
    const save = screen.getByRole('button', { name: 'Save ingredient' });
    expect(cancel.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    expect(save.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(
        screen.getByRole('button', { name: 'Edit ingredient' }),
    ).toBeInTheDocument();
});

it('opens ingredient editing directly from the My Ingredients context menu', async () => {
    mockPickerEnvironment();
    vi.mocked(getUserIngredients).mockResolvedValueOnce([
        {
            ingredientId: 'tofu',
            name: 'Tofu',
            caloriesPer100g: 130,
            proteinPer100g: 15,
            fatPer100g: 4,
            carbohydratePer100g: 5.6,
        },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(
        within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
            'button',
            { name: 'My Ingredients' },
        ),
    );
    const row = await screen.findByRole('button', { name: 'Tofu' });
    fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(
        screen.getByRole('textbox', { name: 'Ingredient name' }),
    ).toHaveValue('Tofu');
    expect(
        screen.getByRole('button', { name: 'Save ingredient' }),
    ).toBeInTheDocument();
});
