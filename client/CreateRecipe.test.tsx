import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreateRecipe from './CreateRecipe';
import { saveRecipe } from './services/recipeService';

vi.mock('./services/recipeService', () => ({
    saveRecipe: vi.fn(),
}));

const rice = {
    ingredientId: 'rice',
    name: 'Rice',
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbohydratePer100g: 28,
    fatPer100g: 0.3,
};
const chicken = {
    ingredientId: 'chicken',
    name: 'Chicken',
    caloriesPer100g: 165,
    proteinPer100g: 31,
    carbohydratePer100g: 0,
    fatPer100g: 3.6,
};

function setup() {
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
        <CreateRecipe
            savedIngredients={[rice, chicken]}
            onSaved={onSaved}
            onCancel={onCancel}
        />,
    );

    return { user, onSaved, onCancel };
}

beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

it('shows validation messages and does not save an incomplete recipe', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(screen.getByText('Give your recipe a name.')).toBeInTheDocument();
    expect(
        screen.getByText('Add at least one ingredient.'),
    ).toBeInTheDocument();
    expect(saveRecipe).not.toHaveBeenCalled();
});

it('adds saved ingredients, updates per-serving totals and saves the payload', async () => {
    const { user, onSaved } = setup();
    const saved = { id: 'r1', recipeName: 'Bowl' };
    vi.mocked(saveRecipe).mockResolvedValue(saved as never);

    await user.type(screen.getByLabelText('Recipe name'), '  Bowl ');
    await user.click(screen.getByRole('button', { name: /^Rice/ }));
    await user.click(screen.getByRole('button', { name: /^Chicken/ }));

    // Both default to 100 g: 130 + 165 kcal, 33.7 g protein.
    const totals = screen.getByRole('group', { name: 'Nutrition per serving' });
    expect(totals).toHaveTextContent('295');
    expect(totals).toHaveTextContent('34');

    await user.click(
        screen.getByRole('button', { name: 'Increase Rice weight' }),
    );
    expect(screen.getByLabelText('Rice weight in grams')).toHaveValue(110);
    expect(totals).toHaveTextContent('308');

    await user.click(screen.getByRole('button', { name: 'Remove Chicken' }));
    expect(totals).toHaveTextContent('143');

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));
    await user.type(screen.getByLabelText('Step 1'), 'Cook the rice');
    await user.click(screen.getByRole('button', { name: '+ Add step' }));
    await user.type(screen.getByLabelText('Step 2'), 'Serve');
    await user.click(screen.getByRole('button', { name: 'Move step 2 up' }));
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(saveRecipe).toHaveBeenCalledWith({
        recipeName: 'Bowl',
        ingredients: [
            expect.objectContaining({
                name: 'Rice',
                weight: 110,
                caloriesPer100g: 130,
            }),
        ],
        instructions: ['Serve', 'Cook the rice'],
        servings: 2,
    });
});

it('adds a manually entered ingredient', async () => {
    const { user } = setup();

    await user.click(
        screen.getByRole('button', { name: 'Enter nutrition manually' }),
    );
    await user.type(screen.getByLabelText('Ingredient name'), 'Honey');
    await user.type(screen.getByLabelText(/^Calories/), '300');
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));

    expect(screen.getByLabelText('Honey weight in grams')).toHaveValue(100);
    expect(
        screen.getByRole('group', { name: 'Nutrition per serving' }),
    ).toHaveTextContent('300');
});

it('shows an error and re-enables Save when saving fails', async () => {
    const { user, onSaved } = setup();
    vi.mocked(saveRecipe).mockRejectedValue(new Error('boom'));

    await user.type(screen.getByLabelText('Recipe name'), 'Bowl');
    await user.click(screen.getByRole('button', { name: /^Rice/ }));
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    expect(await screen.findByText(/boom/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save recipe' })).toBeEnabled();
});

it('only confirms cancel when there is unsaved input', async () => {
    const { user, onCancel } = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Recipe name'), 'Bowl');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
});
