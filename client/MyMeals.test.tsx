import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyMeals from './MyMeals';
import { useState } from 'react';
import { getRecipes, deleteRecipes } from './services/recipeService';
import { saveJournalEntry } from './services/journalService';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import type { Recipe } from '../shared/types/recipe';

vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn(),
    deleteRecipes: vi.fn(),
}));
vi.mock('./services/journalService', () => ({
    saveJournalEntry: vi.fn(),
    deleteJournalEntry: vi.fn(),
}));
const recipes: Recipe[] = [
    {
        id: '1',
        userId: 'user',
        recipeName: 'Tofu bowl',
        ingredients: [
            {
                name: 'Tofu',
                weight: 150,
                caloriesPer100g: 130,
                proteinPer100g: 15,
                carbohydratePer100g: 5.6,
                fatPer100g: 4,
            },
        ],
        instructions: [],
    },
    {
        id: '2',
        userId: 'user',
        recipeName: 'Garden salad',
        ingredients: [
            {
                name: 'Carrot',
                weight: 100,
                caloriesPer100g: 41,
                proteinPer100g: 1,
                carbohydratePer100g: 10,
                fatPer100g: 0.2,
            },
        ],
        instructions: [],
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('meal-maker:show-recipe-nutrition');
    vi.stubGlobal('PointerEvent', MouseEvent);
    mockPickerEnvironment();
    vi.mocked(deleteRecipes).mockImplementation(async (ids) => ids);
    vi.mocked(getRecipes).mockResolvedValue(recipes);
    vi.mocked(saveJournalEntry).mockResolvedValue({ id: 'journal-1' } as never);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function hold(row: HTMLElement) {
    vi.useFakeTimers();
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    vi.useRealTimers();
}

describe('My Meals collection', () => {
    it('shows portion nutrition by default and remembers the eye toggle choice', async () => {
        vi.mocked(getRecipes).mockResolvedValueOnce([
            {
                ...recipes[0],
                recipeName: 'Millet',
                ingredients: [
                    {
                        ...recipes[0].ingredients[0],
                        name: 'Millet',
                        weight: 100,
                        caloriesPer100g: 1559,
                        proteinPer100g: 9,
                        fiberPer100g: 4,
                    },
                ],
            },
        ]);
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        const toggle = screen.getByRole('button', { name: 'Show nutrition' });
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(toggle).toHaveAttribute('title', 'Hide nutrition');
        expect(toggle.querySelector('.my-meals-eye-open')).toBeInTheDocument();
        expect(
            await screen.findByText('1559 kcal · 9 g protein · 4 g fibre'),
        ).toBeInTheDocument();

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(toggle).toHaveAttribute('title', 'Show nutrition');
        expect(
            toggle.querySelector('.my-meals-eye-closed'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('1559 kcal · 9 g protein · 4 g fibre'),
        ).not.toBeInTheDocument();
        expect(localStorage.getItem('meal-maker:show-recipe-nutrition')).toBe(
            'false',
        );

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByText('1559 kcal · 9 g protein · 4 g fibre'),
        ).toBeInTheDocument();
    });

    it('does not report missing fibre as zero', async () => {
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        expect(
            await screen.findByText('195 kcal · 23 g protein · — g fibre'),
        ).toBeInTheDocument();
    });

    it('reveals delete on a left swipe and removes only that meal', async () => {
        const onOpenRecipe = vi.fn();
        render(<MyMeals onOpenRecipe={onOpenRecipe} />);
        const row = await screen.findByRole('button', { name: /Tofu bowl/ });
        fireEvent.pointerDown(row, {
            button: 0,
            pointerId: 1,
            pointerType: 'touch',
            clientX: 160,
            clientY: 20,
        });
        fireEvent.pointerMove(row, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 70,
            clientY: 20,
        });
        fireEvent.pointerUp(row, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 70,
            clientY: 20,
        });
        expect(onOpenRecipe).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Delete Tofu bowl' }),
        );
        await waitFor(() =>
            expect(deleteRecipes).toHaveBeenCalledExactlyOnceWith(['1']),
        );
        await waitFor(() =>
            expect(screen.queryByText('Tofu bowl')).not.toBeInTheDocument(),
        );
        expect(screen.getByText('Garden salad')).toBeInTheDocument();
    });

    it('slides an open row closed when clicking or focusing elsewhere', async () => {
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        const row = await screen.findByRole('button', { name: /Tofu bowl/ });
        const swipe = row.closest('.saved-collection-swipe');
        const search = screen.getByRole('searchbox', { name: 'Search meals' });

        fireEvent.pointerDown(row, {
            button: 0,
            pointerId: 1,
            pointerType: 'touch',
            clientX: 160,
            clientY: 20,
        });
        fireEvent.pointerMove(row, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 70,
            clientY: 20,
        });
        fireEvent.pointerUp(row, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 70,
            clientY: 20,
        });
        expect(swipe).toHaveAttribute('data-open', 'true');

        fireEvent.pointerDown(search, { pointerType: 'mouse' });
        expect(swipe).toHaveAttribute('data-open', 'false');

        fireEvent.pointerDown(row, {
            button: 0,
            pointerId: 2,
            pointerType: 'mouse',
            clientX: 160,
            clientY: 20,
        });
        fireEvent.pointerMove(row, {
            pointerId: 2,
            pointerType: 'mouse',
            clientX: 70,
            clientY: 20,
        });
        fireEvent.pointerUp(row, {
            pointerId: 2,
            pointerType: 'mouse',
            clientX: 70,
            clientY: 20,
        });
        expect(swipe).toHaveAttribute('data-open', 'true');

        fireEvent.focusIn(search);
        expect(swipe).toHaveAttribute('data-open', 'false');
    });

    it('opens Edit from a desktop context menu without opening the row', async () => {
        const onOpenRecipe = vi.fn();
        const onEditRecipe = vi.fn();
        render(
            <MyMeals onOpenRecipe={onOpenRecipe} onEditRecipe={onEditRecipe} />,
        );
        const row = await screen.findByRole('button', { name: /Tofu bowl/ });
        fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });

        const menu = screen.getByRole('menu', { name: 'Tofu bowl actions' });
        expect(menu).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

        expect(onEditRecipe).toHaveBeenCalledExactlyOnceWith(recipes[0]);
        expect(onOpenRecipe).not.toHaveBeenCalled();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('deletes the chosen recipe from the context menu', async () => {
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        const row = await screen.findByRole('button', { name: /Tofu bowl/ });
        fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

        await waitFor(() =>
            expect(deleteRecipes).toHaveBeenCalledExactlyOnceWith(['1']),
        );
        await waitFor(() =>
            expect(screen.queryByText('Tofu bowl')).not.toBeInTheDocument(),
        );
        expect(screen.getByText('Garden salad')).toBeInTheDocument();
    });

    it('opens the context menu from the keyboard and dismisses it with Escape', async () => {
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        const row = await screen.findByRole('button', { name: /Tofu bowl/ });
        fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
        expect(screen.getByRole('menu')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(row).toHaveFocus();
    });

    it('uses fresh server data after a refresh instead of a stale local edit', async () => {
        function Fixture() {
            const [overrides, setOverrides] = useState<Record<string, Recipe>>(
                {},
            );
            const [refreshKey, setRefreshKey] = useState(0);
            return (
                <>
                    <button
                        type="button"
                        onClick={() =>
                            setOverrides({
                                '1': {
                                    ...recipes[0],
                                    recipeName: 'Local edit',
                                },
                            })
                        }
                    >
                        Apply local edit
                    </button>
                    <button
                        type="button"
                        onClick={() => setRefreshKey((key) => key + 1)}
                    >
                        Refresh meals
                    </button>
                    <MyMeals
                        onOpenRecipe={vi.fn()}
                        updatedRecipes={overrides}
                        refreshKey={refreshKey}
                        onRecipesRefreshed={
                            Object.keys(overrides).length
                                ? () => setOverrides({})
                                : undefined
                        }
                    />
                </>
            );
        }
        render(<Fixture />);
        await screen.findByText('Tofu bowl');
        fireEvent.click(
            screen.getByRole('button', { name: 'Apply local edit' }),
        );
        expect(screen.getByText('Local edit')).toBeInTheDocument();
        vi.mocked(getRecipes).mockResolvedValueOnce([
            { ...recipes[0], recipeName: 'Remote edit' },
            recipes[1],
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Refresh meals' }));
        expect(await screen.findByText('Remote edit')).toBeInTheDocument();
        expect(screen.queryByText('Local edit')).not.toBeInTheDocument();
    });
    it('adds a saved recipe to My Plan and opens Create Recipe from the coral button', async () => {
        const onCreate = vi.fn();
        render(<MyMeals onOpenRecipe={vi.fn()} onCreate={onCreate} />);
        await screen.findByText('Tofu bowl');

        fireEvent.click(
            screen.getAllByRole('button', { name: 'Add to My Plan' })[0],
        );
        expect(saveJournalEntry).toHaveBeenCalledOnce();
        expect(vi.mocked(saveJournalEntry).mock.calls[0][0]).toMatchObject({
            mealName: 'Tofu bowl',
            ingredients: recipes[0].ingredients,
        });
        expect(
            await screen.findByRole('button', { name: 'Remove from My Plan' }),
        ).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Create recipe' }));
        expect(onCreate).toHaveBeenCalledOnce();
    });

    it('shows the shared spinner until meals finish loading', async () => {
        let finish!: (recipes: Recipe[]) => void;
        vi.mocked(getRecipes).mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Loading your meals');
        expect(status.querySelector('.loading-spinner')).toBeInTheDocument();
        await act(async () => {
            finish(recipes);
        });
        expect(await screen.findByText('Tofu bowl')).toBeInTheDocument();
        expect(
            screen.queryByText('Loading your meals…'),
        ).not.toBeInTheDocument();
        expect(
            document.querySelector('.loading-spinner'),
        ).not.toBeInTheDocument();
    });

    it('shows saved meals, searches names and ingredients, and opens the selected meal', async () => {
        const onOpenRecipe = vi.fn();
        render(<MyMeals onOpenRecipe={onOpenRecipe} />);
        expect(
            screen.getByRole('heading', { name: 'My Recipes' }),
        ).toBeInTheDocument();
        await screen.findByText('Tofu bowl');
        expect(
            screen.queryByRole('img', { name: 'Saved meal' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByRole('button', { name: 'Add to My Plan' }),
        ).toHaveLength(2);
        expect(document.querySelectorAll('.my-meals-row-photo')).toHaveLength(
            2,
        );
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: ' carrot ' },
        });
        expect(screen.queryByText('Tofu bowl')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Garden salad/ }));
        expect(onOpenRecipe).toHaveBeenCalledWith(recipes[1]);
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'TOFU BOWL' },
        });
        expect(screen.getByText('Tofu bowl')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'missing' },
        });
        expect(screen.getByText('No matching meals')).toBeInTheDocument();
    });

    it('preserves search and loaded meals while hidden without an add button', async () => {
        const props = { onOpenRecipe: vi.fn() };
        const { rerender } = render(<MyMeals {...props} />);
        await screen.findByText('Tofu bowl');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'tofu' },
        });
        rerender(<MyMeals {...props} isActive={false} />);
        expect(
            screen.queryByRole('button', { name: 'Create recipe' }),
        ).not.toBeInTheDocument();
        rerender(<MyMeals {...props} isActive />);
        expect(screen.getByRole('searchbox')).toHaveValue('tofu');
        expect(getRecipes).toHaveBeenCalledTimes(2);
        expect(
            screen.queryByRole('button', { name: 'Create recipe' }),
        ).not.toBeInTheDocument();
    });

    it('refreshes in the background when returning to My Recipes', async () => {
        const props = { onOpenRecipe: vi.fn() };
        const { rerender } = render(<MyMeals {...props} />);
        await screen.findByText('Tofu bowl');
        rerender(<MyMeals {...props} isActive={false} />);
        vi.mocked(getRecipes).mockResolvedValueOnce([
            { ...recipes[0], id: '3', recipeName: 'New laptop recipe' },
            ...recipes,
        ]);
        rerender(<MyMeals {...props} isActive />);
        expect(screen.getByText('Tofu bowl')).toBeInTheDocument();
        expect(
            await screen.findByText('New laptop recipe'),
        ).toBeInTheDocument();
        expect(getRecipes).toHaveBeenCalledTimes(2);
    });

    it('refreshes by pulling down from the top while keeping meals visible', async () => {
        render(
            <div className="page-transition">
                <MyMeals onOpenRecipe={vi.fn()} />
            </div>,
        );
        await screen.findByText('Tofu bowl');
        let finish!: (recipes: Recipe[]) => void;
        vi.mocked(getRecipes).mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        const row = screen.getByRole('button', { name: /Tofu bowl/ });
        fireEvent.touchStart(row, {
            touches: [{ clientX: 20, clientY: 100 }],
        });
        fireEvent.touchMove(row, {
            touches: [{ clientX: 20, clientY: 240 }],
        });
        fireEvent.touchEnd(row);
        expect(
            screen.getByRole('status', { name: 'Refreshing recipes' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Tofu bowl')).toBeInTheDocument();
        await act(async () => {
            finish([
                { ...recipes[0], id: '3', recipeName: 'New laptop recipe' },
                ...recipes,
            ]);
        });
        expect(
            await screen.findByText('New laptop recipe'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('status', { name: 'Refreshing recipes' }),
        ).not.toBeInTheDocument();
    });

    it('contains a downward pull at the page top before browser refresh can take over', async () => {
        const { container } = render(
            <div className="page-transition">
                <MyMeals onOpenRecipe={vi.fn()} />
            </div>,
        );
        await screen.findByText('Tofu bowl');
        const heading = screen.getByRole('heading', { name: 'My Recipes' });
        fireEvent.touchStart(heading, {
            touches: [{ clientX: 30, clientY: 80 }],
        });
        const move = new Event('touchmove', {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(move, 'touches', {
            value: [{ clientX: 30, clientY: 110 }],
        });
        fireEvent(heading, move);
        expect(move.defaultPrevented).toBe(true);
        fireEvent.touchEnd(heading);
        expect(getRecipes).toHaveBeenCalledOnce();

        const scroller = container.querySelector('.page-transition')!;
        scroller.scrollTop = 50;
        fireEvent.touchStart(heading, {
            touches: [{ clientX: 30, clientY: 80 }],
        });
        const normalScroll = new Event('touchmove', {
            bubbles: true,
            cancelable: true,
        });
        Object.defineProperty(normalScroll, 'touches', {
            value: [{ clientX: 30, clientY: 110 }],
        });
        fireEvent(heading, normalScroll);
        expect(normalScroll.defaultPrevented).toBe(false);
        fireEvent.touchEnd(heading);
    });

    it('shows an empty state for a collection without meals', async () => {
        vi.mocked(getRecipes).mockResolvedValue([]);
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        expect(
            await screen.findByText('No saved meals yet'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'My Recipes' }),
        ).toBeInTheDocument();
    });

    it('allows a failed load to be retried', async () => {
        vi.mocked(getRecipes).mockRejectedValueOnce(new Error('offline'));
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not load your meals',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('Tofu bowl')).toBeInTheDocument();
        expect(getRecipes).toHaveBeenCalledTimes(2);
    });

    it('keeps cached recipes visible if a background refresh fails', async () => {
        const onOpenRecipe = vi.fn();
        const { rerender } = render(
            <MyMeals onOpenRecipe={onOpenRecipe} refreshKey={0} />,
        );
        await screen.findByText('Tofu bowl');
        vi.mocked(getRecipes).mockRejectedValueOnce(new Error('offline'));

        rerender(<MyMeals onOpenRecipe={onOpenRecipe} refreshKey={1} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not refresh your meals',
        );
        expect(screen.getByText('Tofu bowl')).toBeInTheDocument();
        expect(
            screen.queryByText('Loading your meals…'),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        );
        expect(screen.getByText('Garden salad')).toBeInTheDocument();
        expect(getRecipes).toHaveBeenCalledTimes(3);
    });
    it('enters selection on long press without opening, then bulk deletes selected meals', async () => {
        const onOpenRecipe = vi.fn();
        render(<MyMeals onOpenRecipe={onOpenRecipe} />);
        hold(await screen.findByRole('button', { name: /Tofu bowl/ }));
        expect(onOpenRecipe).not.toHaveBeenCalled();
        expect(
            document.querySelector(
                '.saved-collection-row-wrapper-selected .saved-collection-row',
            ),
        ).toHaveAttribute('aria-pressed', 'true');
        const selectedCard = document.querySelector(
            '.saved-collection-row-wrapper-selected',
        )!;
        const trailingSelection = selectedCard.querySelector<HTMLButtonElement>(
            '.my-meals-selection-action',
        )!;
        expect(trailingSelection).toBeVisible();
        expect(
            trailingSelection.querySelector('.collection-selection-check'),
        ).toBeInTheDocument();
        expect(
            trailingSelection.querySelector('.my-meals-saved-star'),
        ).not.toBeInTheDocument();
        expect(
            selectedCard.querySelector(
                '.saved-collection-row .collection-selection-check',
            ),
        ).not.toBeInTheDocument();
        fireEvent.click(trailingSelection);
        expect(selectedCard).not.toHaveClass(
            'saved-collection-row-wrapper-selected',
        );
        fireEvent.click(trailingSelection);
        expect(selectedCard).toHaveClass(
            'saved-collection-row-wrapper-selected',
        );
        expect(
            screen.queryByRole('button', { name: 'Create recipe' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Select Garden salad' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete 2 meals' }));
        expect(deleteRecipes).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm delete 2 meals' }),
        );
        expect(
            await screen.findByText('No saved meals yet'),
        ).toBeInTheDocument();
        expect(deleteRecipes).toHaveBeenCalledExactlyOnceWith(['1', '2']);
        expect(
            screen.queryByRole('button', { name: 'Create recipe' }),
        ).not.toBeInTheDocument();
    });

    it('selects search results while retaining other selections, and cancels with Escape or the cross', async () => {
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        await screen.findByText('Tofu bowl');
        fireEvent.click(screen.getByRole('button', { name: 'Select meals' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Select Tofu bowl' }),
        );
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'garden' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Select results' }));
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Deselect results' }),
        );
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Select meals' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Cancel selection' }),
        );
        expect(
            screen.queryByRole('button', { name: 'Create recipe' }),
        ).not.toBeInTheDocument();
        expect(deleteRecipes).not.toHaveBeenCalled();
    });

    it('lets the user cancel a bulk delete before any meal is removed', async () => {
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        await screen.findByText('Tofu bowl');
        fireEvent.click(screen.getByRole('button', { name: 'Select meals' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Select Tofu bowl' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete 1 meal' }));
        expect(screen.getByText('Delete 1 meal?')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Cancel delete' }),
        ).toHaveFocus();
        fireEvent.keyDown(
            screen.getByRole('button', { name: 'Cancel delete' }),
            {
                key: 'Escape',
            },
        );
        expect(
            screen.getByRole('button', { name: 'Delete 1 meal' }),
        ).toHaveFocus();
        expect(deleteRecipes).not.toHaveBeenCalled();
        expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('animates a row only after deletion succeeds, then removes it', async () => {
        let finishDelete!: (ids: string[]) => void;
        vi.mocked(deleteRecipes).mockReturnValueOnce(
            new Promise((resolve) => {
                finishDelete = resolve;
            }),
        );
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        await screen.findByText('Tofu bowl');
        fireEvent.click(screen.getByRole('button', { name: 'Select meals' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Select Tofu bowl' }),
        );
        const row = screen.getByRole('button', { name: 'Deselect Tofu bowl' });
        vi.useFakeTimers();
        fireEvent.click(screen.getByRole('button', { name: 'Delete 1 meal' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm delete 1 meal' }),
        );
        expect(row.parentElement).not.toHaveClass('my-meals-row-exiting');

        await act(async () => finishDelete(['1']));
        expect(row.parentElement).toHaveClass('my-meals-row-exiting');
        await act(async () => vi.advanceTimersByTime(180));
        expect(screen.queryByText('Tofu bowl')).not.toBeInTheDocument();
        expect(screen.getByText('Garden salad')).toBeInTheDocument();
    });

    it('keeps failed and partially deleted items selected for retry', async () => {
        vi.mocked(deleteRecipes)
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(['1'])
            .mockResolvedValueOnce(['2']);
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        await screen.findByText('Tofu bowl');
        fireEvent.click(screen.getByRole('button', { name: 'Select meals' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete 2 meals' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm delete 2 meals' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not delete',
        );
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete 2 meals' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm delete 2 meals' }),
        );
        expect(
            await screen.findByRole('button', { name: 'Delete 1 meal' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Tofu bowl')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Some meals could not be deleted',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete 1 meal' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm delete 1 meal' }),
        );
        expect(
            await screen.findByText('No saved meals yet'),
        ).toBeInTheDocument();
        expect(deleteRecipes).toHaveBeenLastCalledWith(['2']);
    });

    it('does not select or open a meal when a press turns into scrolling', async () => {
        const onOpenRecipe = vi.fn();
        render(<MyMeals onOpenRecipe={onOpenRecipe} />);
        const row = await screen.findByRole('button', { name: /Tofu bowl/ });
        vi.useFakeTimers();
        fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerMove(row, { clientX: 10, clientY: 30 });
        act(() => vi.advanceTimersByTime(600));
        fireEvent.pointerUp(row);
        fireEvent.click(row);
        expect(onOpenRecipe).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: 'Cancel selection' }),
        ).not.toBeInTheDocument();
        fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerUp(row);
        fireEvent.click(row);
        expect(onOpenRecipe).toHaveBeenCalledWith(recipes[0]);
    });
});
