import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { getUserIngredients } from './services/ingredientService';
import { saveRecipe } from './services/recipeService';
import { mockPickerEnvironment } from './test/pickerEnvironment';

const auth = vi.hoisted(() => ({
    user: null as { id: string } | null,
    loading: false,
    signOut: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
}));

vi.mock('./auth/useAuth', () => ({
    useAuth: () => auth,
}));
vi.mock('./services/ingredientService', () => ({
    getUserIngredients: vi.fn().mockResolvedValue([]),
}));
vi.mock('./services/recipeService', () => ({
    saveRecipe: vi.fn().mockResolvedValue({ id: 'recipe-1' }),
    deleteRecipe: vi.fn().mockResolvedValue(undefined),
    updateRecipe: vi.fn(),
}));

beforeEach(() => {
    auth.user = null;
    vi.clearAllMocks();
    localStorage.clear();
    mockPickerEnvironment();
});
afterEach(() => vi.unstubAllGlobals());

it('offers returning and new users authentication before the guest trial', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<App />);

    expect(
        screen.getByRole('heading', {
            name: 'Meal Maker',
        }),
    ).toBeVisible();
    expect(
        screen.getByText('Eat plant-based. Meet your nutrition goals.'),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Meal maker' })).toBeVisible();
    expect(
        screen.queryByRole('button', { name: 'Open navigation menu' }),
    ).not.toBeInTheDocument();
    expect(getUserIngredients).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
        screen.getByRole('dialog', { name: 'Welcome to Meal Maker' }),
    ).toBeVisible();
    expect(
        screen.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(
        screen.getByRole('heading', { name: 'A fresh start.' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: /Try it out/i }));
    await waitFor(() =>
        expect(
            screen
                .getByRole('region', { name: 'Meal maker' })
                .querySelector('.meal-maker-form'),
        ).toHaveFocus(),
    );
    expect(
        screen.queryByRole('dialog', { name: 'Welcome to Meal Maker' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
        expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({
            behavior: 'smooth',
            block: 'start',
        }),
    );
    expect(screen.getByRole('banner')).toBeVisible();
    expect(
        screen.queryByRole('button', { name: 'Open navigation menu' }),
    ).not.toBeInTheDocument();

    auth.user = { id: 'user' };
    rerender(<App />);

    expect(
        screen.queryByRole('heading', {
            name: 'Meal Maker',
        }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Meal maker' })).toBeVisible();
});

it('invites guests to sign in before adding a generated meal to My Plan', async () => {
    const meal = {
        mealName: 'Pumpkin bowl',
        instructions: [],
        ingredients: [
            {
                name: 'Pumpkin',
                weight: 100,
                caloriesPer100g: 26,
                proteinPer100g: 1,
                carbohydratePer100g: 6.5,
                fatPer100g: 0.1,
            },
        ],
    };
    localStorage.setItem(
        'meal-maker-guest-draft',
        JSON.stringify({
            pendingAuth: true,
            ingredients: ['Pumpkin'],
            ingredientNutrition: meal.ingredients,
            meal,
            originalMeal: meal,
        }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add to My Plan' }));
    expect(
        screen.getByRole('dialog', { name: 'Keep your meal' }),
    ).toHaveTextContent('add this meal to My Plan');
    expect(saveRecipe).not.toHaveBeenCalled();
});

it('prompts for an account only on a protected meal action and keeps the meal', async () => {
    const meal = {
        mealName: 'Pumpkin bowl',
        instructions: [],
        ingredients: [
            {
                name: 'Pumpkin',
                weight: 100,
                caloriesPer100g: 26,
                proteinPer100g: 1,
                carbohydratePer100g: 6.5,
                fatPer100g: 0.1,
            },
        ],
    };
    localStorage.setItem(
        'meal-maker-guest-draft',
        JSON.stringify({
            pendingAuth: true,
            ingredients: ['Pumpkin'],
            ingredientNutrition: meal.ingredients,
            meal,
            originalMeal: meal,
        }),
    );
    const user = userEvent.setup();
    const { rerender } = render(<App />);

    expect(screen.getByRole('heading', { name: 'Pumpkin bowl' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save this meal' }));

    expect(
        screen.getByRole('dialog', { name: 'Keep your meal' }),
    ).toHaveTextContent('account or sign in to save this meal');

    auth.user = { id: 'user' };
    rerender(<App />);

    expect(
        screen.queryByRole('dialog', { name: 'Keep your meal' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pumpkin bowl' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Save this meal' }));
    expect(saveRecipe).toHaveBeenCalledOnce();
    expect(
        screen.getByRole('button', {
            name: 'Remove this meal from saved',
        }),
    ).toHaveAttribute('aria-pressed', 'true');
});

it('clears the meal workspace when a signed-in user logs out', async () => {
    auth.user = { id: 'user' };
    auth.signOut.mockImplementation(async () => {
        auth.user = null;
    });
    localStorage.setItem(
        'meal-maker-guest-draft',
        JSON.stringify({
            pendingAuth: true,
            ingredients: ['Pumpkin'],
            ingredientNutrition: [],
            meal: {
                mealName: 'Old meal',
                instructions: [],
                ingredients: [],
            },
            originalMeal: {
                mealName: 'Old meal',
                instructions: [],
                ingredients: [],
            },
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    const scroller = document.querySelector<HTMLElement>(
        '.page-transition-meal-maker',
    );
    if (scroller) scroller.scrollTop = 500;

    expect(screen.getByRole('heading', { name: 'Old meal' })).toBeVisible();
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(
        screen.queryByRole('heading', { name: 'Old meal' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('combobox', { name: 'Search or add an ingredient' }),
    ).toHaveValue('');
    expect(localStorage.getItem('meal-maker-guest-draft')).toBeNull();
    await waitFor(() => expect(scroller?.scrollTop).toBe(0));
    expect(screen.getByRole('heading', { name: 'Meal Maker' })).toBeVisible();
    expect(document.querySelector('.guest-landing-logo img')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Try it out/i })).toBeVisible();
});

it('does not restore an ordinary stale guest workspace', () => {
    localStorage.setItem(
        'meal-maker-guest-draft',
        JSON.stringify({
            ingredients: ['Pumpkin'],
            ingredientNutrition: [],
            meal: {
                mealName: 'Stale meal',
                instructions: [],
                ingredients: [],
            },
            originalMeal: {
                mealName: 'Stale meal',
                instructions: [],
                ingredients: [],
            },
        }),
    );

    render(<App />);

    expect(
        screen.queryByRole('heading', { name: 'Stale meal' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('combobox', { name: 'Search or add an ingredient' }),
    ).toHaveValue('');
    expect(localStorage.getItem('meal-maker-guest-draft')).toBeNull();
});
