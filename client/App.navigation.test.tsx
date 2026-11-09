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
import { getRecipes } from './services/recipeService';
import { getUserIngredients } from './services/ingredientService';

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
    ).toEqual(['Create Meal', 'My Ingredients', 'My Meals', 'My Day']);
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
    await select('My Day');
    expect(
        await screen.findByRole('heading', { name: 'My Day' }),
    ).toBeInTheDocument();
    await screen.findByText('No food logged for this day');
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

it('navigates from the bottom tabs and returns focus to More after closing the menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = screen.getByRole('navigation', { name: 'Main tabs' });
    expect(
        within(tabs)
            .getAllByRole('button')
            .map((button) => button.textContent),
    ).toEqual(['Discover', 'My Plan', 'Recipes', 'Ingredients', 'More']);

    await user.click(within(tabs).getByRole('button', { name: 'Ingredients' }));
    expect(
        await screen.findByRole('heading', { name: 'My Ingredients' }),
    ).toBeInTheDocument();
    expect(
        within(tabs).getByRole('button', { name: 'Ingredients' }),
    ).toHaveAttribute('aria-current', 'page');

    await user.click(within(tabs).getByRole('button', { name: 'My Plan' }));
    expect(
        await screen.findByRole('heading', { name: 'My Day' }),
    ).toBeInTheDocument();

    const more = within(tabs).getByRole('button', { name: 'More' });
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute('aria-expanded', 'false');

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

    await user.click(within(tabs).getByRole('button', { name: 'My Plan' }));
    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));

    expect(screen.getByRole('searchbox', { name: 'Search meals' })).toHaveValue(
        'tofu',
    );
    expect(screen.queryByText('Loading your meals…')).not.toBeInTheDocument();
    expect(getRecipes).toHaveBeenCalledTimes(2);
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
    await user.click(within(tabs).getByRole('button', { name: 'My Plan' }));
    expect(window.location.pathname).toBe('/my-plan');
    await user.click(within(tabs).getByRole('button', { name: 'Recipes' }));
    expect(window.location.pathname).toBe('/my-recipes');
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/my-plan'));
    expect(screen.getByRole('heading', { name: 'My Day' })).toBeInTheDocument();
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
    ['/my-plan', 'My Day'],
    ['/settings', 'Settings'],
])('opens %s directly', (path, heading) => {
    window.history.replaceState(null, '', path);
    render(<App />);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
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
