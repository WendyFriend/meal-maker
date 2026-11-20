import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { getUserIngredients } from './services/ingredientService';
import { mockPickerEnvironment } from './test/pickerEnvironment';

vi.mock('./auth/useAuth', () => ({
    useAuth: () => ({
        user: { id: 'user' },
        loading: false,
        signOut: vi.fn(),
    }),
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
    vi.mocked(getUserIngredients).mockResolvedValue([]);
    window.localStorage.clear();
    mockPickerEnvironment();
});
afterEach(async () => {
    // Let result-scroll callbacks finish before restoring matchMedia.
    await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
    );
    vi.unstubAllGlobals();
});

it('reports the meal generation server timing', async () => {
    const user = userEvent.setup();
    const timingLog = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetch = vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
            new Response(
                JSON.stringify(
                    url === '/api/ingredient-nutrition'
                        ? {
                              name: 'Tofu',
                              caloriesPer100g: 76,
                              proteinPer100g: 8,
                              carbohydratePer100g: 1.9,
                              fatPer100g: 4.8,
                          }
                        : {
                              mealName: 'Tofu bowl',
                              ingredients: [],
                              instructions: ['Cook: serve'],
                          },
                ),
                {
                    headers: {
                        'Server-Timing':
                            'nutrition_lab;dur=9163.8;desc="Nutrition Lab round trip", generation;dur=9164.8',
                    },
                },
            ),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await user.click(
        screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await user.click(screen.getByRole('button', { name: 'Create Meal' }));
    await user.type(screen.getByRole('combobox'), 'Tofu{Enter}');
    await user.click(screen.getByRole('button', { name: 'See recipes' }));

    await waitFor(() =>
        expect(
            fetch.mock.calls.some(([url]) => url === '/api/generate-meal'),
        ).toBe(true),
    );
    expect(timingLog).toHaveBeenCalledWith(
        'Meal generation timing',
        expect.objectContaining({
            requestMs: expect.any(Number),
            serverMs: 9163.8,
        }),
    );
    timingLog.mockRestore();
});
