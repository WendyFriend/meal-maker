import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import {
    getUserIngredients,
    updateUserIngredient,
} from './services/ingredientService';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import { saveMealGenerator } from './settings/mealGenerator';

vi.mock('./auth/useAuth', () => ({
    useAuth: () => ({ user: { id: 'user' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('./services/ingredientService', () => ({
    getUserIngredients: vi.fn(),
    saveUserIngredient: vi.fn(),
    updateUserIngredient: vi.fn(),
    deleteUserIngredient: vi.fn(),
    deleteUserIngredients: vi.fn(async (ids: string[]) => ids),
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
    vi.mocked(updateUserIngredient).mockImplementation(
        async (id, ingredient) => ({ ...ingredient, ingredientId: id }),
    );
    vi.mocked(getUserIngredients).mockResolvedValue([spinach, tofu]);
});
afterEach(() => {
    window.localStorage.clear();
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
        within(nutrition).queryByRole('heading', {
            name: 'Preparation tips',
        }),
    ).not.toBeInTheDocument();
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
    await user.click(within(nutrition).getByRole('button', { name: 'Done' }));
    expect(nutrition).toBeInTheDocument();
    expect(
        within(nutrition).getByRole('row', { name: /Calories/ }),
    ).toHaveTextContent('50');
    expect(within(nutrition).queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.click(
        within(nutrition).getByRole('button', { name: 'Close sheet' }),
    );
    await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.body.style.overflow).toBe('');
        expect(
            screen.getByRole('button', { name: 'Edit nutrition for Spinach' }),
        ).toHaveFocus();
    });

    const search = screen.getByRole('combobox');
    await user.type(search, 'Tofu{Enter}');
    await user.type(search, 'Paprika{Enter}');
    const selectedSection = screen.getByRole('region', {
        name: 'Selected ingredients',
    });
    expect(selectedSection).toBeVisible();
    expect(
        screen.queryByRole('heading', { name: 'Ingredients' }),
    ).not.toBeInTheDocument();
    const category = screen.getByRole('button', { name: 'Veggies' });
    const caloriesHeading = screen.getByRole('heading', {
        name: '2. Calorie goal',
    });
    for (const [before, after] of [
        [category, search],
        [search, selectedSection],
        [selectedSection, caloriesHeading],
        [
            caloriesHeading,
            screen.getByRole('button', { name: 'Create my meal' }),
        ],
    ]) {
        expect(
            before.compareDocumentPosition(after) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    }
    expect(screen.queryByText('if you have one')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    const generationRequests = () =>
        fetch.mock.calls.filter(([url]) => url === '/api/generate-meal');
    await waitFor(() => expect(generationRequests()).toHaveLength(1));
    const [url, request] = generationRequests()[0];
    expect(url).toBe('/api/generate-meal');
    expect(JSON.parse(request!.body as string)).toEqual({
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

it('uses curated Nutrition Lab values without a runtime lookup', async () => {
    vi.mocked(getUserIngredients).mockResolvedValue([]);
    const fetch = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                mealName: 'Tomato bowl',
                ingredients: [],
                instructions: ['Serve.'],
            }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Veggies' }));
    await user.click(
        within(screen.getByRole('dialog', { name: 'Veggies' })).getByRole(
            'button',
            { name: 'Tomato' },
        ),
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() =>
        expect(
            fetch.mock.calls.some(([url]) => url === '/api/generate-meal'),
        ).toBe(true),
    );
    expect(
        fetch.mock.calls.some(([url]) => url === '/api/ingredient-nutrition'),
    ).toBe(false);
    const [, request] = fetch.mock.calls.find(
        ([url]) => url === '/api/generate-meal',
    )!;
    expect(JSON.parse(request!.body as string).ingredients[0]).toEqual(
        expect.objectContaining({
            name: 'Tomato',
            caloriesPer100g: 18,
            proteinPer100g: 0.88,
            carbohydratePer100g: 3.89,
            fatPer100g: 0.2,
            vitaminCPer100g: 13.7,
            nutritionSource: {
                fdcId: 170457,
                description: 'Tomatoes, red, ripe, raw, year round average',
            },
        }),
    );
});

it('clears selected ingredients and disables meal creation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole('combobox'), 'Spinach{Enter}Tofu{Enter}');
    const section = screen.getByRole('region', {
        name: 'Selected ingredients',
    });
    expect(section).toBeVisible();
    await user.click(
        within(section).getByRole('button', {
            name: 'Clear',
        }),
    );
    expect(section).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(
        screen.queryByRole('button', { name: 'Remove Spinach' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Create my meal' }),
    ).toBeDisabled();
});

it('reveals the cooking animation while waiting, then scrolls to the completed meal', async () => {
    const user = userEvent.setup();
    let complete!: (value: Response) => void;
    vi.stubGlobal(
        'fetch',
        vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    complete = resolve;
                }),
        ),
    );
    render(<App />);
    await user.type(screen.getByRole('combobox'), 'Tofu{Enter}');
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));
    await waitFor(() =>
        expect(scroll).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'end',
        }),
    );
    expect(
        scroll.mock.contexts.some(
            (target) =>
                target instanceof HTMLElement &&
                target.classList.contains('generating-indicator'),
        ),
    ).toBe(true);
    scroll.mockClear();
    complete(
        new Response(
            JSON.stringify({
                mealName: 'Tofu bowl',
                ingredients: [],
                instructions: ['Serve.'],
            }),
        ),
    );
    expect(
        await screen.findByRole('heading', { name: 'Tofu bowl' }),
    ).toBeVisible();
    await waitFor(() =>
        expect(scroll).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'start',
        }),
    );
    expect(
        scroll.mock.contexts.some(
            (target) =>
                target instanceof HTMLElement &&
                target.classList.contains('meal-maker-result'),
        ),
    ).toBe(true);
});

it('reuses looked-up nutrition for an unknown ingredient during generation', async () => {
    saveMealGenerator('nutrition-lab');
    let finishLookup!: (response: Response) => void;
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
        (url) => {
            if (url === '/api/ingredient-nutrition')
                return new Promise<Response>((resolve) => {
                    finishLookup = resolve;
                });
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        mealName: 'Pumpkin bowl',
                        ingredients: [],
                        instructions: ['Serve.'],
                    }),
                ),
            );
        },
    );
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('combobox'), 'Pumpkin{Enter}');
    await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
            '/api/ingredient-nutrition',
            expect.anything(),
        ),
    );
    finishLookup(
        new Response(
            JSON.stringify({
                name: 'Pumpkin, raw',
                caloriesPer100g: 26,
                proteinPer100g: 1,
                carbohydratePer100g: 6.5,
                fatPer100g: 0.1,
                fiberPer100g: 1.5,
                ironPer100g: 0.8,
                nutritionSource: {
                    fdcId: 168448,
                    description: 'Pumpkin, raw',
                },
            }),
        ),
    );
    await user.click(
        screen.getByRole('button', { name: 'Edit nutrition for Pumpkin' }),
    );
    expect(
        await screen.findByRole('row', { name: /Calories/ }),
    ).toHaveTextContent('26 kcal');
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await user.click(screen.getByRole('button', { name: 'Create my meal' }));

    await waitFor(() =>
        expect(
            fetch.mock.calls.some(([url]) => url === '/api/generate-meal'),
        ).toBe(true),
    );
    const [, request] = fetch.mock.calls.find(
        ([url]) => url === '/api/generate-meal',
    )!;
    expect(JSON.parse(request!.body as string)).toEqual({
        ingredients: [
            expect.objectContaining({
                name: 'Pumpkin',
                caloriesPer100g: 26,
                proteinPer100g: 1,
                carbohydratePer100g: 6.5,
                fatPer100g: 0.1,
                fiberPer100g: 1.5,
                ironPer100g: 0.8,
            }),
        ],
        requirements: {},
    });
});
