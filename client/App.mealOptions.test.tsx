import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { getUserIngredients } from './services/ingredientService';
import { clearMatchCache } from './services/matchService';
import { mockPickerEnvironment } from './test/pickerEnvironment';

vi.mock('./auth/AuthContext', () => ({
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
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    countRecipes: vi.fn().mockResolvedValue(0),
}));
// These import lib/supabase, which throws without env.
vi.mock('./services/profileService', async () => {
    const { DEFAULT_PROFILE } = await import('../shared/types/profile');

    return {
        getProfile: vi
            .fn()
            .mockResolvedValue({ ...DEFAULT_PROFILE, plan: 'pro' }),
        startTrial: vi.fn(),
        switchDevTier: vi.fn(),
        updateProfile: vi.fn(),
    };
});
vi.mock('./services/usageService', () => ({
    getGenerationsToday: vi.fn().mockResolvedValue(0),
    recordGeneration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./services/mealPlanService', () => ({
    addEntry: vi.fn(),
    toDateKey: (date: Date) => date.toISOString().slice(0, 10),
    addDays: (date: Date, days: number) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
}));

const tofuMeal = {
    name: 'Tofu',
    caloriesPer100g: 76,
    proteinPer100g: 8,
    carbohydratePer100g: 1.9,
    fatPer100g: 4.8,
    weight: 150,
};

// Routes by URL: USDA matching finds nothing, so ingredients go to the
// generator as typed. `fetch.generateCalls` are the generate-meal requests.
function mockFetch(estimatedIngredients?: string[]) {
    const fetch = vi.fn(async (url: string) => ({
        status: 200,
        ok: true,
        json: async () =>
            url === '/api/match-ingredients'
                ? { matches: [] }
                : {
                      mealName: 'Tofu bowl',
                      instructions: ['Cook and serve.'],
                      ingredients: [tofuMeal],
                      servings: 2,
                      estimatedIngredients,
                  },
    }));
    vi.stubGlobal('fetch', fetch);
    return Object.assign(fetch, {
        generateCalls: () =>
            fetch.mock.calls.filter(
                ([url]) => url === '/api/generate-meal',
            ) as unknown as [string, { body: string }][],
    });
}

beforeEach(() => {
    // The diet choice is remembered in localStorage.
    localStorage.clear();
    clearMatchCache();
    mockPickerEnvironment();
    vi.mocked(getUserIngredients).mockResolvedValue([]);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

it('sends the chosen options and offers variations of the result', async () => {
    const fetch = mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await user.type(screen.getByRole('combobox'), 'Tofu{Enter}');
    await user.click(screen.getByRole('button', { name: /More options/ }));
    await user.click(screen.getByRole('button', { name: 'More servings' }));
    await user.click(screen.getByRole('button', { name: 'Dinner' }));
    await user.click(screen.getByRole('button', { name: 'Vegan' }));
    await user.click(screen.getByRole('button', { name: 'Gluten-free' }));
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() => expect(fetch.generateCalls()).toHaveLength(1));
    expect(JSON.parse(fetch.generateCalls()[0][1].body).requirements).toEqual({
        servings: 2,
        mealType: 'dinner',
        dietary: ['vegan', 'gluten-free'],
    });
    expect(await screen.findByText(/Serves 2/)).toHaveTextContent(
        'nutrition per serving',
    );

    await user.click(screen.getByRole('button', { name: 'Higher protein' }));

    await waitFor(() => expect(fetch.generateCalls()).toHaveLength(2));
    const second = JSON.parse(fetch.generateCalls()[1][1].body);
    expect(second.ingredients).toEqual([{ name: 'Tofu' }]);
    expect(second.requirements).toEqual({
        servings: 2,
        mealType: 'dinner',
        dietary: ['vegan', 'gluten-free'],
        variation: 'higher-protein',
        previousMealName: 'Tofu bowl',
    });
});

it('lists estimated ingredients with an Add nutrition action', async () => {
    mockFetch(['Tofu']);
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await user.type(screen.getByRole('combobox'), 'Tofu{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    await user.click(
        await screen.findByRole('button', { name: 'Add nutrition for Tofu' }),
    );

    expect(
        screen.getByRole('dialog', { name: 'Ingredient nutrition' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Calories/ })).toHaveValue(
        76,
    );
});

it('flags ingredients that clash with the diet and leaves them out', async () => {
    const fetch = mockFetch();
    const user = userEvent.setup();
    render(<App initialPage="meal-maker" />);

    await user.click(screen.getByRole('button', { name: 'Vegan' }));
    await user.type(screen.getByRole('combobox'), 'Chicken breast{Enter}');
    await user.type(screen.getByRole('combobox'), 'Tofu{Enter}');

    expect(
        screen.getByRole('button', {
            name: 'Edit nutrition for Chicken breast (not vegan)',
        }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
        "Chicken breast doesn't fit your diet",
    );
    expect(localStorage.getItem('mealmaker-diet')).toBe('["vegan"]');

    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    await waitFor(() => expect(fetch.generateCalls()).toHaveLength(1));
    expect(JSON.parse(fetch.generateCalls()[0][1].body).ingredients).toEqual([
        { name: 'Tofu' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Remove it' }));
    expect(
        screen.queryByRole('button', { name: /Chicken breast/ }),
    ).not.toBeInTheDocument();
});
