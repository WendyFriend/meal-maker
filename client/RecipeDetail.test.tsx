import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import RecipeDetail from './RecipeDetail';
import { saveRecipe, updateRecipe } from './services/recipeService';
import { addEntry } from './services/mealPlanService';
import type { Recipe } from '../shared/types/recipe';

vi.mock('./services/recipeService', () => ({
    saveRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    countRecipes: vi.fn(),
}));
vi.mock('./services/mealPlanService', () => ({
    addEntry: vi.fn(),
    toDateKey: (date: Date) => date.toISOString().slice(0, 10),
    addDays: (date: Date, days: number) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
}));
// These import lib/supabase, which throws without env. Without a plan
// provider nothing is gated.
vi.mock('./services/profileService', () => ({}));
vi.mock('./services/usageService', () => ({}));

const recipe: Recipe = {
    id: 'r1',
    userId: 'user',
    recipeName: 'Tofu bowl',
    instructions: ['Cook.'],
    servings: 2,
    ingredients: [
        {
            name: 'Tofu',
            caloriesPer100g: 76,
            proteinPer100g: 8,
            carbohydratePer100g: 1.9,
            fatPer100g: 4.8,
            weight: 150,
        },
    ],
};

it('offers Save changes only after a weight changes and saves it', async () => {
    const saved = {
        ...recipe,
        ingredients: [{ ...recipe.ingredients[0], weight: 155 }],
    };
    vi.mocked(updateRecipe).mockResolvedValue(saved);
    const onRecipeUpdated = vi.fn();
    const user = userEvent.setup();
    render(<RecipeDetail recipe={recipe} onRecipeUpdated={onRecipeUpdated} />);

    expect(
        screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();

    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onRecipeUpdated).toHaveBeenCalledWith(saved));
    expect(updateRecipe).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
            ingredients: [expect.objectContaining({ weight: 155 })],
        }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument();
});

const beanRecipe: Recipe = {
    ...recipe,
    id: 'r2',
    recipeName: 'Bean and spinach stew',
    ingredients: [
        {
            name: 'Kidney beans',
            caloriesPer100g: 333,
            proteinPer100g: 23,
            carbohydratePer100g: 60,
            fatPer100g: 1,
            weight: 100,
            nutritionSource: 'usda',
            usda: { fdcId: 1, description: 'Beans, kidney, raw' },
            micronutrientsPer100g: { vitaminK: 19, iron: 8.2 },
        },
        {
            name: 'Spinach',
            caloriesPer100g: 23,
            proteinPer100g: 3,
            carbohydratePer100g: 4,
            fatPer100g: 0.4,
            weight: 100,
            micronutrientsPer100g: { vitaminK: 483 },
        },
    ],
};

it('shows preparation notes and vitamins for a saved meal', () => {
    render(<RecipeDetail recipe={beanRecipe} />);

    const notes = screen.getByRole('region', { name: 'Preparation & safety' });
    expect(
        within(notes).getByText('Kidney beans must be boiled hard'),
    ).toBeInTheDocument();
    expect(
        within(notes).getByText('Blanch high-oxalate greens'),
    ).toBeInTheDocument();

    // Vitamin K sums across ingredients: 19 + 483 µg.
    expect(screen.getByText('502 µg')).toBeInTheDocument();
    expect(screen.getByText('Iron')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
});

it('adds the stored recipe to the plan without saving a copy', async () => {
    const user = userEvent.setup();
    render(<RecipeDetail recipe={beanRecipe} />);

    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to plan' });
    await user.click(within(dialog).getByRole('button', { name: 'Lunch' }));
    await user.click(
        within(dialog).getByRole('button', { name: 'Add to plan' }),
    );

    await waitFor(() =>
        expect(addEntry).toHaveBeenCalledWith(
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            'lunch',
            'r2',
            1,
        ),
    );
    expect(saveRecipe).not.toHaveBeenCalled();
});
