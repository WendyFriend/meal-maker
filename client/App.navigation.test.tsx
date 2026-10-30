import { fireEvent, render, screen, within } from '@testing-library/react';
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

it('targets the form for Create Meal and the intro for the Meal Maker logo, including from other pages', async () => {
    const user = userEvent.setup();
    render(<App />);
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
    expect(lastScrollTarget()).toHaveClass('meal-maker-introduction');
    expect(document.activeElement).toHaveClass('meal-maker-introduction');
    await open();
    await select('My Ingredients');
    expect(
        await screen.findByRole('heading', { name: 'My Ingredients' }),
    ).toBeInTheDocument();
    await open();
    await user.click(screen.getByRole('button', { name: 'Meal Maker' }));
    expect(lastScrollTarget()).toHaveClass('meal-maker-introduction');
    await open();
    await select('My Day');
    expect(
        await screen.findByRole('heading', { name: 'My Day' }),
    ).toBeInTheDocument();
    await screen.findByText('No food logged for this day');
    await open();
    await select('My Meals');
    expect(
        await screen.findByRole('heading', { name: 'My Meals' }),
    ).toBeInTheDocument();
    await open();
    await select('Create Meal');
    expect(lastScrollTarget()).toHaveClass('meal-maker-tool');
    expect(document.activeElement).toHaveClass('meal-maker-form');
});
