import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../shared/types/recipe';
import MealPlan from './MealPlan';
import ShoppingList from './ShoppingList';
import * as recipeService from './services/recipeService';
import * as mealPlanService from './services/mealPlanService';
import * as shoppingListService from './services/shoppingListService';

vi.mock('./lib/supabase', () => ({ supabase: {} }));
vi.mock('./services/recipeService', () => ({ getRecipes: vi.fn() }));
vi.mock('./services/mealPlanService', async (importOriginal) => ({
    ...(await importOriginal<typeof mealPlanService>()),
    getEntriesForRange: vi.fn(),
    addEntry: vi.fn(),
    removeEntry: vi.fn(),
}));
vi.mock('./services/shoppingListService', async (importOriginal) => ({
    ...(await importOriginal<typeof shoppingListService>()),
    getItems: vi.fn(),
    addItems: vi.fn(),
    setChecked: vi.fn(),
    removeItem: vi.fn(),
    clearChecked: vi.fn(),
}));

const porridge: Recipe = {
    id: 'r1',
    userId: 'u',
    recipeName: 'Porridge',
    instructions: [],
    servings: 2,
    ingredients: [
        {
            name: 'Oats',
            weight: 50,
            caloriesPer100g: 380,
            proteinPer100g: 13,
            carbohydratePer100g: 60,
            fatPer100g: 7,
        },
    ],
} as Recipe;

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(recipeService.getRecipes).mockResolvedValue([porridge]);
    vi.mocked(mealPlanService.getEntriesForRange).mockResolvedValue([]);
    vi.mocked(shoppingListService.getItems).mockResolvedValue([]);
});

describe('MealPlan', () => {
    it('adds a recipe to a slot and can add the week to the list', async () => {
        const user = userEvent.setup();
        const today = mealPlanService.toDateKey(new Date());
        vi.mocked(mealPlanService.addEntry).mockResolvedValue({
            id: 'e1',
            planDate: today,
            slot: 'breakfast',
            recipeId: 'r1',
        });
        vi.mocked(shoppingListService.addItems).mockResolvedValue(1);

        render(<MealPlan onOpenRecipe={vi.fn()} />);

        const adds = await screen.findAllByRole('button', {
            name: /^Add Breakfast on/,
        });
        await user.click(adds[0]);
        await user.click(await screen.findByText('Porridge'));

        expect(mealPlanService.addEntry).toHaveBeenCalledWith(
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            'breakfast',
            'r1',
        );
        // 50 g * 380 kcal / 100 per serving
        expect(await screen.findAllByText('190 kcal')).not.toHaveLength(0);

        await user.click(
            screen.getByRole('button', { name: 'Add week to shopping list' }),
        );
        expect(shoppingListService.addItems).toHaveBeenCalledWith([
            { name: 'Oats', quantity: '100 g' },
        ]);
        expect(await screen.findByText('Added 1 item')).toBeInTheDocument();
    });

    it('shows an empty state without saved recipes', async () => {
        vi.mocked(recipeService.getRecipes).mockResolvedValue([]);

        render(<MealPlan onOpenRecipe={vi.fn()} />);

        expect(
            await screen.findByText('No saved recipes yet'),
        ).toBeInTheDocument();
    });
});

describe('ShoppingList', () => {
    it('shows counts with unchecked items first', async () => {
        vi.mocked(shoppingListService.getItems).mockResolvedValue([
            { id: '1', name: 'Eggs', checked: true },
            { id: '2', name: 'Rice', quantity: '200 g', checked: false },
        ]);

        render(<ShoppingList />);

        expect(
            await screen.findByText('1 to buy · 1 checked'),
        ).toBeInTheDocument();
        const names = screen
            .getAllByRole('checkbox')
            .map((box) => box.closest('li')?.textContent);
        expect(names[0]).toContain('Rice');
        expect(names[1]).toContain('Eggs');
    });

    it('adds a custom item', async () => {
        const user = userEvent.setup();
        vi.mocked(shoppingListService.addItems).mockResolvedValue(1);

        render(<ShoppingList />);

        await screen.findByText('Your list is empty');
        await user.type(screen.getByLabelText('Item name'), 'Milk');
        await user.type(screen.getByLabelText('Quantity'), '2 L');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(shoppingListService.addItems).toHaveBeenCalledWith([
                { name: 'Milk', quantity: '2 L' },
            ]),
        );
    });
});
