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
    expect(screen.getByText('Snap a photo.')).toBeVisible();
    expect(screen.getByText('Get your meal plan.')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Meal maker' })).toBeVisible();
    expect(
        screen.queryByRole('button', { name: 'Open navigation menu' }),
    ).not.toBeInTheDocument();
    expect(getUserIngredients).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    const signUp = screen.getByRole('dialog', {
        name: 'Create your Meal Maker account',
    });
    expect(signUp).toHaveTextContent('Save your own ingredients');
    expect(
        screen.getByRole('button', { name: 'Create free account' }),
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
        screen.queryByRole('dialog', {
            name: 'Create your Meal Maker account',
        }),
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

it('invites guests to sign in before adding a generated meal to My Diary', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Add to My Diary' }));
    expect(
        screen.getByRole('dialog', { name: 'Create your Meal Maker account' }),
    ).toHaveTextContent('Easy meal planning');
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
        screen.getByRole('dialog', { name: 'Create your Meal Maker account' }),
    ).toHaveTextContent('Macro & micronutrient tracking');
    // Returning users switch to signing in; the meal is still promised.
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
    expect(
        screen.queryByText('Save your own ingredients'),
    ).not.toBeInTheDocument();

    auth.user = { id: 'user' };
    rerender(<App />);

    expect(
        screen.queryByRole('dialog', { name: 'Welcome back' }),
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

it('forgets saved ingredients when the session ends without logging out', async () => {
    auth.user = { id: 'user' };
    vi.mocked(getUserIngredients).mockResolvedValue([
        {
            ingredientId: 'lentils',
            name: 'Red split lentils, dry',
            caloriesPer100g: 358,
            proteinPer100g: 24,
            carbohydratePer100g: 63,
            fatPer100g: 1.5,
        },
    ]);
    localStorage.setItem(
        'meal-maker-guest-draft',
        JSON.stringify({
            pendingAuth: true,
            ingredients: ['Red split lentils, dry'],
            ingredientNutrition: [],
        }),
    );
    const { rerender } = render(<App />);
    expect(
        await screen.findByRole('button', {
            name: 'Edit nutrition for Red split lentils, dry, saved',
        }),
    ).toBeVisible();

    // e.g. the session expired, or the user logged out in another tab.
    auth.user = null;
    rerender(<App />);
    const user = userEvent.setup();
    const tryIt = screen.queryByRole('button', { name: /Try it out/i });
    if (tryIt) await user.click(tryIt);

    expect(
        screen.queryByRole('button', { name: /, saved$/ }),
    ).not.toBeInTheDocument();
    await user.type(
        screen.getByRole('combobox', { name: 'Search or add an ingredient' }),
        'red split',
    );
    expect(document.querySelector('.saved-mark')).toBeNull();
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

it('asks guests to sign in when they star an ingredient', async () => {
    localStorage.setItem(
        'meal-maker-guest-draft',
        JSON.stringify({
            pendingAuth: true,
            ingredients: ['Pumpkin'],
            ingredientNutrition: [
                {
                    name: 'Pumpkin',
                    caloriesPer100g: 26,
                    proteinPer100g: 1,
                    carbohydratePer100g: 6.5,
                    fatPer100g: 0.1,
                },
            ],
        }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(
        screen.getByRole('button', { name: 'Edit nutrition for Pumpkin' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save to My Ingredients' }),
    );
    expect(
        screen.getByRole('dialog', { name: 'Create your Meal Maker account' }),
    ).toHaveTextContent('Save your own ingredients');
    // Nothing was saved, so the star stays empty.
    expect(
        screen.getByRole('button', { name: 'Save to My Ingredients' }),
    ).toHaveAttribute('aria-pressed', 'false');
});
