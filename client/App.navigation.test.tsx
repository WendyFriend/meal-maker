import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import { getRecipes, saveRecipe } from './services/recipeService';
import { getUserIngredients } from './services/ingredientService';
import {
    getJournalEntries,
    saveJournalEntry,
    updateJournalEntryIngredients,
    updateJournalEntryName,
} from './services/journalService';

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
    updateJournalEntryIngredients: vi.fn(),
    updateJournalEntryName: vi.fn(),
}));
beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    mockPickerEnvironment();
});
afterEach(() => vi.unstubAllGlobals());

it('uses a single menu trigger with four destinations and supports Escape and outside dismissal', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
        screen.queryByRole('navigation', { name: 'Primary' }),
    ).not.toBeInTheDocument();
    const menu = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(
        within(screen.getByRole('navigation', { name: 'Primary' }))
            .getAllByRole('button')
            .map((button) => button.textContent),
    ).toEqual(['Create Meal', 'My Ingredients', 'My Meals', 'My Diary']);
    expect(screen.getByRole('button', { name: 'Meal Maker' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(menu).toHaveFocus();
    expect(
        screen.queryByRole('navigation', { name: 'Primary' }),
    ).not.toBeInTheDocument();
    await user.click(menu);
    fireEvent.click(document.querySelector('.sidebar-backdrop')!);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
});

it('targets the form from Create Meal and the Meal Maker logo, including from other pages', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
        screen.queryByRole('heading', {
            name: /Your ingredients.*A delicious meal/i,
        }),
    ).not.toBeInTheDocument();
    const open = () =>
        user.click(
            screen.getByRole('button', { name: 'Open navigation menu' }),
        );
    const select = (name: string) =>
        user.click(
            within(
                screen.getByRole('navigation', { name: 'Primary' }),
            ).getByRole('button', { name }),
        );
    const lastScrollTarget = () =>
        vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1);
    await open();
    await select('Create Meal');
    expect(lastScrollTarget()).toHaveClass('meal-maker-tool');
    expect(document.activeElement).toHaveClass('meal-maker-form');
    await open();
    await user.click(screen.getByRole('button', { name: 'Meal Maker' }));
    expect(lastScrollTarget()).toHaveClass('meal-maker-tool');
    expect(document.activeElement).toHaveClass('meal-maker-form');
    await open();
    await select('My Ingredients');
    expect(
        await screen.findByRole('heading', { name: 'My Ingredients' }),
    ).toBeInTheDocument();
    await open();
    await user.click(screen.getByRole('button', { name: 'Meal Maker' }));
    expect(lastScrollTarget()).toHaveClass('meal-maker-tool');
    await open();
    await select('My Diary');
    expect(
        await screen.findByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();
    await screen.findByText('No meals in your diary for this day');
    await open();
    await select('My Meals');
    expect(
        await screen.findByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
    await open();
    await select('Create Meal');
    expect(lastScrollTarget()).toHaveClass('meal-maker-tool');
    expect(document.activeElement).toHaveClass('meal-maker-form');
});

it('navigates from the bottom tabs', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Main tabs' });
    expect(
        within(tabs)
            .getAllByRole('button')
            .map((button) => button.textContent),
    ).toEqual(['Discover', 'Diary', 'Recipes', 'Ingredients', 'Profile']);

    await user.click(within(tabs).getByRole('button', { name: 'Ingredients' }));
    expect(
        await screen.findByRole('heading', { name: 'My Ingredients' }),
    ).toBeInTheDocument();
    expect(
        within(tabs).getByRole('button', { name: 'Ingredients' }),
    ).toHaveAttribute('aria-current', 'page');

    await user.click(within(tabs).getByRole('button', { name: 'Diary' }));
    expect(
        await screen.findByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();

    await user.click(within(tabs).getByRole('button', { name: 'Profile' }));
    expect(
        await screen.findByRole('heading', { name: 'Profile' }),
    ).toBeInTheDocument();
    expect(
        within(tabs).getByRole('button', { name: 'Profile' }),
    ).toHaveAttribute('aria-current', 'page');

    // Back to Recipes (kept mounted since its first visit) after Profile
    // shows My Recipes, not a leftover Profile.
    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));
    await screen.findByRole('heading', { name: 'My Recipes' });
    await user.click(within(tabs).getByRole('button', { name: 'Profile' }));
    await screen.findByRole('heading', { name: 'Profile' });
    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));
    expect(
        await screen.findByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: 'Profile' }),
    ).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole('button', { name: 'Discover' }));
    expect(document.activeElement).toHaveClass('meal-maker-form');
});

it('keeps My Recipes loaded when switching tabs', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Main tabs' });

    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));
    expect(await screen.findByText('No saved meals yet')).toBeInTheDocument();
    expect(getRecipes).toHaveBeenCalledOnce();
    await user.type(
        screen.getByRole('searchbox', { name: 'Search meals' }),
        'tofu',
    );

    await user.click(within(tabs).getByRole('button', { name: 'Diary' }));
    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));

    expect(screen.getByRole('searchbox', { name: 'Search meals' })).toHaveValue(
        'tofu',
    );
    expect(screen.queryByText('Loading your meals…')).not.toBeInTheDocument();
    expect(getRecipes).toHaveBeenCalledOnce();
});

it('keeps My Diary loaded when switching tabs', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Main tabs' });

    await user.click(within(tabs).getByRole('button', { name: 'Diary' }));
    expect(
        await screen.findByText('No meals in your diary for this day'),
    ).toBeInTheDocument();
    expect(getJournalEntries).toHaveBeenCalledOnce();

    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));
    await user.click(within(tabs).getByRole('button', { name: 'Diary' }));

    expect(
        screen.getByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading your diary…')).not.toBeInTheDocument();
    expect(getJournalEntries).toHaveBeenCalledOnce();
});

it('returns to My Recipes after a page reload while that tab is open', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(
        within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole(
            'button',
            { name: 'Recipes' },
        ),
    );
    expect(await screen.findByText('No saved meals yet')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/my-recipes');
    view.unmount();

    render(<App />);
    expect(
        await screen.findByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByText('What do you feel like today?'),
    ).not.toBeInTheDocument();
});

it('gives main tabs URLs and restores them with browser Back', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Main tabs' });
    await user.click(within(tabs).getByRole('button', { name: 'Diary' }));
    expect(window.location.pathname).toBe('/my-diary');
    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));
    expect(window.location.pathname).toBe('/my-recipes');
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/my-diary'));
    expect(
        screen.getByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();
    act(() => window.history.forward());
    await waitFor(() => expect(window.location.pathname).toBe('/my-recipes'));
    expect(
        screen.getByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
});

it('keeps saved ingredients visible if a pull refresh fails', async () => {
    window.history.replaceState(null, '', '/my-ingredients');
    const broccoli = {
        ingredientId: 'broccoli',
        name: 'Broccoli',
        caloriesPer100g: 34,
        proteinPer100g: 2.8,
        carbohydratePer100g: 6.6,
        fatPer100g: 0.4,
    };
    vi.mocked(getUserIngredients).mockResolvedValueOnce([broccoli]);
    render(<App />);
    await screen.findByText('Broccoli');
    vi.mocked(getUserIngredients).mockRejectedValueOnce(new Error('offline'));
    const heading = screen.getByRole('heading', { name: 'My Ingredients' });
    fireEvent.touchStart(heading, { touches: [{ clientX: 24, clientY: 80 }] });
    fireEvent.touchMove(heading, { touches: [{ clientX: 24, clientY: 220 }] });
    fireEvent.touchEnd(heading);
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not refresh your ingredients',
    );
    expect(screen.getByText('Broccoli')).toBeInTheDocument();
});

it('opens My Ingredients directly from its URL and refreshes on pull', async () => {
    window.history.replaceState(null, '', '/my-ingredients');
    render(<App />);
    expect(
        screen.getByRole('heading', { name: 'My Ingredients' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getUserIngredients).toHaveBeenCalledOnce());
    let finish!: (
        ingredients: Awaited<ReturnType<typeof getUserIngredients>>,
    ) => void;
    vi.mocked(getUserIngredients).mockReturnValueOnce(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    const heading = screen.getByRole('heading', { name: 'My Ingredients' });
    fireEvent.touchStart(heading, { touches: [{ clientX: 24, clientY: 80 }] });
    fireEvent.touchMove(heading, { touches: [{ clientX: 24, clientY: 220 }] });
    fireEvent.touchEnd(heading);
    expect(
        screen.getByRole('status', { name: 'Refreshing ingredients' }),
    ).toBeInTheDocument();
    await act(async () => {
        finish([
            {
                ingredientId: 'broccoli',
                name: 'Broccoli',
                caloriesPer100g: 34,
                proteinPer100g: 2.8,
                carbohydratePer100g: 6.6,
                fatPer100g: 0.4,
            },
        ]);
    });
    expect(await screen.findByText('Broccoli')).toBeInTheDocument();
    expect(
        screen.queryByRole('status', { name: 'Refreshing ingredients' }),
    ).not.toBeInTheDocument();
});

it.each([
    ['/my-diary', 'My Diary', '/my-diary'],
    // The old My Plan address still works and moves to the new one.
    ['/my-plan', 'My Diary', '/my-diary'],
    ['/profile', 'Profile', '/profile'],
    // The old Settings address opens Profile.
    ['/settings', 'Profile', '/profile'],
])('opens %s directly', (path, heading, canonical) => {
    window.history.replaceState(null, '', path);
    render(<App />);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(window.location.pathname).toBe(canonical);
});

it('shows a new recipe on My Recipes without reloading the list', async () => {
    const user = userEvent.setup();
    vi.mocked(getUserIngredients).mockResolvedValue([
        {
            ingredientId: 'lentils-1',
            name: 'Lentils',
            caloriesPer100g: 116,
            proteinPer100g: 9,
            carbohydratePer100g: 20,
            fatPer100g: 0.4,
        },
    ]);
    vi.mocked(saveRecipe).mockImplementation(async (recipe) => ({
        ...recipe,
        id: 'recipe-new',
        userId: 'user-1',
    }));
    render(<App />);
    await user.click(
        within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole(
            'button',
            { name: 'Recipes' },
        ),
    );
    await user.click(
        await screen.findByRole('button', { name: 'Create recipe' }),
    );
    await user.type(
        screen.getByRole('textbox', { name: 'Recipe name' }),
        'Lentil soup',
    );
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 1' }),
        'Lentils{Enter}',
    );
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByText('Lentil soup')).toBeInTheDocument();
    expect(getRecipes).toHaveBeenCalledOnce();
});

it('opens Create Recipe from My Meals and returns to the list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
        within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole(
            'button',
            {
                name: 'Recipes',
            },
        ),
    );
    expect(
        await screen.findByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create recipe' }));
    expect(
        screen.getByRole('textbox', { name: 'Recipe name' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Add ingredient' }),
    ).toBeInTheDocument();
    await user.click(
        screen.getByRole('button', { name: 'Cancel creating recipe' }),
    );
    expect(
        await screen.findByRole('heading', { name: 'My Recipes' }),
    ).toBeInTheDocument();
});

it('adds a manually entered meal to My Diary without saving a recipe', async () => {
    const user = userEvent.setup();
    vi.mocked(getUserIngredients).mockResolvedValue([
        {
            ingredientId: 'lentils-1',
            name: 'Lentils',
            caloriesPer100g: 116,
            proteinPer100g: 9,
            carbohydratePer100g: 20,
            fatPer100g: 0.4,
        },
    ]);
    vi.mocked(saveJournalEntry).mockImplementation(async (input) => ({
        ...input,
        id: 'new',
    }));
    render(<App />);
    await user.click(
        within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole(
            'button',
            { name: 'Diary' },
        ),
    );
    await user.click(await screen.findByRole('button', { name: 'Add meal' }));
    await user.click(screen.getByRole('button', { name: /Create a new one/ }));

    // The meal is created in place on My Diary, not on another page.
    await user.type(
        await screen.findByRole('combobox', { name: 'Ingredient 1' }),
        'Lentils{Enter}',
    );
    // ✕ / ✓ are in the app header, not in the meal.
    const header = document.querySelector('header.page-header') as HTMLElement;
    expect(header).toHaveTextContent('New Meal');
    expect(
        within(
            document.querySelector('.journal-meals')! as HTMLElement,
        ).queryByRole('button', { name: 'Save ingredients changes' }),
    ).not.toBeInTheDocument();
    await user.click(
        within(header).getByRole('button', {
            name: 'Save ingredients changes',
        }),
    );

    await waitFor(() => expect(saveJournalEntry).toHaveBeenCalledOnce());
    const weekday = new Date().toLocaleDateString('en-AU', {
        weekday: 'long',
    });
    expect(vi.mocked(saveJournalEntry).mock.calls[0][0]).toMatchObject({
        mealName: `${weekday} lentils`,
    });
    expect(saveRecipe).not.toHaveBeenCalled();
    expect(
        screen.getByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();
    // The header returns once the meal is saved.
    await waitFor(() =>
        expect(
            document.querySelector('header.page-header'),
        ).not.toHaveTextContent('New Meal'),
    );
});

it('opens a My Diary meal as a recipe page and returns to My Diary', async () => {
    const user = userEvent.setup();
    vi.mocked(getJournalEntries).mockResolvedValue([
        {
            id: 'plan-1',
            eatenAt: new Date().toISOString(),
            mealName: 'Lentil bowl',
            ingredients: [
                {
                    name: 'Lentils',
                    weight: 150,
                    caloriesPer100g: 116,
                    proteinPer100g: 9,
                    carbohydratePer100g: 20,
                    fatPer100g: 0.4,
                },
            ],
        },
    ]);
    render(<App />);
    await user.click(
        within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole(
            'button',
            { name: 'Diary' },
        ),
    );
    // The meal page opens from the meal's menu.
    fireEvent.contextMenu(
        (
            await screen.findByRole('button', { name: 'Meal 1, Lentil bowl' })
        ).closest('.journal-meal-row')!,
    );
    await user.click(screen.getByRole('menuitem', { name: 'View Details' }));

    expect(
        await screen.findByRole('heading', { name: 'Lentil bowl' }),
    ).toBeInTheDocument();
    expect(
        within(
            document.querySelector<HTMLElement>('.recipe-detail')!,
        ).getAllByText('Lentils').length,
    ).toBeGreaterThan(0);
    expect(
        screen.getByRole('button', { name: 'Save this meal' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Add to My Diary' }),
    ).toBeNull();

    // Ingredient edits are saved to the plan, not to My Recipes.
    vi.mocked(updateJournalEntryIngredients).mockImplementation(
        async (id, ingredients) => ({
            id,
            eatenAt: new Date().toISOString(),
            mealName: 'Lentil bowl',
            ingredients,
        }),
    );
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    const weight = screen.getByRole('spinbutton', {
        name: 'Lentils weight in grams',
    });
    await user.clear(weight);
    await user.type(weight, '200');
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() =>
        expect(updateJournalEntryIngredients).toHaveBeenCalledWith('plan-1', [
            expect.objectContaining({ name: 'Lentils', weight: 200 }),
        ]),
    );
    expect(saveRecipe).not.toHaveBeenCalled();

    // Renaming uses the header ✕ / ✓ and also saves only to the plan.
    vi.mocked(updateJournalEntryName).mockImplementation(
        async (id, mealName) => ({
            id,
            eatenAt: new Date().toISOString(),
            mealName,
            ingredients: [],
        }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Lentil bowl' }),
    );
    expect(screen.getByText('Edit Name')).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Meal name' });
    await user.clear(name);
    await user.type(name, 'Red lentil dal');
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));
    await waitFor(() =>
        expect(updateJournalEntryName).toHaveBeenCalledWith(
            'plan-1',
            'Red lentil dal',
        ),
    );
    expect(
        await screen.findByRole('heading', { name: 'Red lentil dal' }),
    ).toBeInTheDocument();
    expect(saveRecipe).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
        await screen.findByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();
});
