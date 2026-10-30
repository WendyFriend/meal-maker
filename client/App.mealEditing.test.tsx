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

it('saves with the actual header tick and updates the retained My Meals list', async () => {
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
    vi.mocked(getRecipes).mockResolvedValue([recipe]);
    vi.mocked(updateRecipe).mockImplementation(async (_id, value) => value);
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
        screen.queryByRole('button', { name: 'Save meal' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Reset ingredient weights' }),
    ).not.toBeInTheDocument();
    const editMeal = screen.getByRole('button', { name: 'Edit meal' });
    const editClick = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
    });
    fireEvent(editMeal, editClick);
    expect(editClick.defaultPrevented).toBe(true);
    expect(editMeal).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save meal' })).not.toBe(
        editMeal,
    );
    const weight = screen.getByRole('spinbutton', {
        name: 'Tofu weight in grams',
    });
    await user.clear(weight);
    await user.type(weight, '150');
    await user.clear(screen.getByRole('textbox', { name: 'Instructions' }));
    await user.type(
        screen.getByRole('textbox', { name: 'Instructions' }),
        'Changed cooking step.',
    );
    expect(
        screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(
        screen.queryByRole('spinbutton', { name: 'Tofu weight in grams' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('100 g')).toBeInTheDocument();
    expect(screen.getByText('Stir for 2 minutes.')).toBeInTheDocument();
    expect(
        screen.queryByRole('textbox', { name: 'Instructions' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Reset ingredient weights' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(updateRecipe).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    await waitFor(() =>
        expect(updateRecipe).toHaveBeenCalledWith(
            'meal-1',
            expect.objectContaining({
                ingredients: [expect.objectContaining({ weight: 105 })],
            }),
        ),
    );
    await waitFor(() =>
        expect(
            screen.queryByRole('button', { name: 'Save meal' }),
        ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
        await screen.findByRole('heading', { name: 'My Meals' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 ingredient · 137 kcal')).toBeInTheDocument();
    expect(getRecipes).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /Tofu bowl/ }));
    expect(screen.getByText('105 g')).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: /Tofu.*kcal/ }));
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
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(
        screen.getByRole('button', { name: 'Edit ingredient' }),
    ).toBeInTheDocument();
});
