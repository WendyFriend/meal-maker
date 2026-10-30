import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { mockPickerEnvironment } from './test/pickerEnvironment';

vi.mock('./auth/useAuth', () => ({
    useAuth: () => ({ user: { id: 'user' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('./services/ingredientService', () => ({
    getUserIngredients: vi.fn().mockResolvedValue([]),
}));
vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn().mockResolvedValue([]),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    saveRecipe: vi.fn(),
    deleteRecipes: vi.fn(),
}));
vi.mock('./services/journalService', () => ({
    getJournalEntries: vi.fn().mockResolvedValue([]),
    saveJournalEntry: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockPickerEnvironment();
});
afterEach(() => vi.unstubAllGlobals());

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
}

it('defaults to Ollama and remembers the chosen meal generator', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await openSettings(user);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('radio', { name: /Ollama/ })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /Nutrition Lab/ }));
    expect(screen.getByRole('radio', { name: /Nutrition Lab/ })).toBeChecked();

    unmount();
    render(<App />);
    await openSettings(user);
    expect(screen.getByRole('radio', { name: /Nutrition Lab/ })).toBeChecked();
});

it('sends the chosen generator with the meal request', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                mealName: 'Tofu bowl',
                ingredients: [],
                instructions: ['Cook: serve'],
            }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await openSettings(user);
    await user.click(screen.getByRole('radio', { name: /Nutrition Lab/ }));
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(screen.getByRole('button', { name: 'Create Meal' }));
    await user.type(screen.getByRole('combobox'), 'Tofu{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() =>
        expect(
            fetch.mock.calls.some(([url]) => url === '/api/generate-meal'),
        ).toBe(true),
    );
    const [, request] = fetch.mock.calls.find(
        ([url]) => url === '/api/generate-meal',
    )!;
    expect(request.headers['X-Meal-Generator']).toBe('nutrition-lab');
});
