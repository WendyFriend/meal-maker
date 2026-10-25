import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import RecipeDetail from './RecipeDetail';
import { updateRecipe } from './services/recipeService';
import type { Recipe } from '../shared/types/recipe';

vi.mock('./services/recipeService', () => ({
    saveRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
}));

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
