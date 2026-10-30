import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyMeals from './MyMeals';
import { getRecipes, deleteRecipes } from './services/recipeService';
import type { Recipe } from '../shared/types/recipe';

vi.mock('./services/recipeService', () => ({
    getRecipes: vi.fn(),
    deleteRecipes: vi.fn(),
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
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.mocked(deleteRecipes).mockImplementation(async (ids) => ids);
    vi.mocked(getRecipes).mockResolvedValue(recipes);
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

    it('shows the saved count, searches meal names and ingredients, and opens the selected meal', async () => {
        const onOpenRecipe = vi.fn();
        render(<MyMeals onOpenRecipe={onOpenRecipe} />);
        expect(
            screen.getByRole('heading', { name: 'My Meals' }),
        ).toBeInTheDocument();
        await screen.findByText('2 saved');
        expect(screen.getByText('1 ingredient · 195 kcal')).toBeInTheDocument();
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
            screen.queryByRole('button', { name: 'Create meal' }),
        ).not.toBeInTheDocument();
        rerender(<MyMeals {...props} isActive />);
        expect(screen.getByRole('searchbox')).toHaveValue('tofu');
        expect(getRecipes).toHaveBeenCalledOnce();
        expect(
            screen.queryByRole('button', { name: 'Create meal' }),
        ).not.toBeInTheDocument();
    });

    it('shows an empty state for a collection without meals', async () => {
        vi.mocked(getRecipes).mockResolvedValue([]);
        render(<MyMeals onOpenRecipe={vi.fn()} />);
        expect(
            await screen.findByText('No saved meals yet'),
        ).toBeInTheDocument();
        expect(screen.getByText('0 saved')).toBeInTheDocument();
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
    it('enters selection on long press without opening, then bulk deletes selected meals', async () => {
        const onOpenRecipe = vi.fn();
        render(<MyMeals onOpenRecipe={onOpenRecipe} />);
        hold(await screen.findByRole('button', { name: /Tofu bowl/ }));
        expect(onOpenRecipe).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', { name: 'Deselect Tofu bowl' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.queryByRole('button', { name: 'Create meal' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Select Garden salad' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete 2 meals' }));
        expect(
            await screen.findByText('No saved meals yet'),
        ).toBeInTheDocument();
        expect(deleteRecipes).toHaveBeenCalledExactlyOnceWith(['1', '2']);
        expect(
            screen.queryByRole('button', { name: 'Create meal' }),
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
            screen.queryByRole('button', { name: 'Create meal' }),
        ).not.toBeInTheDocument();
        expect(deleteRecipes).not.toHaveBeenCalled();
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
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not delete',
        );
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete 2 meals' }));
        expect(
            await screen.findByRole('button', { name: 'Delete 1 meal' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Tofu bowl')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Some meals could not be deleted',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete 1 meal' }));
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
