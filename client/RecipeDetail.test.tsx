import type { DetailEditorHandle } from './components/DetailEditorHandle';
import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RecipeDetail from './RecipeDetail';
import type { Recipe } from '../shared/types/recipe';
import { mockPickerEnvironment } from './test/pickerEnvironment';

vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));

beforeEach(() => mockPickerEnvironment(true));
afterEach(() => vi.unstubAllGlobals());

const recipe: Recipe = {
    id: 'meal-1',
    userId: 'user',
    recipeName: 'Tofu bowl',
    ingredients: [
        {
            name: 'Tofu',
            resolvedName: 'Firm tofu',
            weight: 100,
            caloriesPer100g: 130,
            proteinPer100g: 15,
            carbohydratePer100g: 5.6,
            fatPer100g: 4,
            sugarPer100g: 1,
            fiberPer100g: 2,
            thumbnailSource: 'local',
        },
    ],
    instructions: ['Cook: Stir for 2 minutes.'],
};

function setup(save = vi.fn(async (value: Recipe) => value)) {
    function Fixture() {
        const ref = useRef<DetailEditorHandle>(null);
        const [editor, setEditor] = useState({ editing: false, saving: false });
        return (
            <>
                <header>
                    {editor.editing ? (
                        <>
                            <button
                                type="reset"
                                form="meal-detail-form"
                                disabled={editor.saving}
                                aria-label="Cancel editing"
                            >
                                ✕
                            </button>
                            <button
                                type="submit"
                                form="meal-detail-form"
                                disabled={editor.saving}
                                aria-label="Save meal"
                            >
                                ✓
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            aria-label="Edit meal"
                            onClick={() => ref.current?.edit()}
                        >
                            Edit
                        </button>
                    )}
                </header>
                <RecipeDetail
                    ref={ref}
                    recipe={recipe}
                    savedIngredients={[
                        {
                            ingredientId: 'broccoli-1',
                            name: 'Broccoli',
                            caloriesPer100g: 34,
                            proteinPer100g: 2.8,
                            carbohydratePer100g: 6.6,
                            fatPer100g: 0.4,
                        },
                    ]}
                    onSave={save}
                    onEditorStateChange={setEditor}
                />
            </>
        );
    }
    render(<Fixture />);
    return { user: userEvent.setup(), save };
}

it('opens the Create Recipe layout with saved name, ingredients, and optional steps', async () => {
    const { user } = setup();
    expect(
        screen.getByRole('img', { name: 'Saved to My Meals' }),
    ).toBeInTheDocument();
    expect(screen.getByText('100 g')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    expect(
        screen.getByRole('img', { name: 'Default recipe image' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Recipe name' })).toHaveValue(
        'Tofu bowl',
    );
    expect(
        screen.getByRole('spinbutton', {
            name: 'Ingredient 1 weight in grams',
        }),
    ).toHaveValue(100);
    expect(
        screen.getByRole('button', { name: 'Add ingredient' }),
    ).toBeEnabled();
    expect(
        screen.getByRole('tab', { name: 'Ingredients & nutrition' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
        screen.getByRole('tab', { name: 'Steps (optional)' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Add to My Plan' }),
    ).not.toBeInTheDocument();
});

it('adds an ingredient and saves edits without dropping existing nutrition data', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase ingredient 1 weight' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'Broccoli{Enter}',
    );
    await user.click(screen.getByRole('button', { name: 'Save meal' }));

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            id: 'meal-1',
            ingredients: [
                expect.objectContaining({
                    name: 'Tofu',
                    weight: 105,
                    sugarPer100g: 1,
                    fiberPer100g: 2,
                    resolvedName: 'Firm tofu',
                    thumbnailSource: 'local',
                }),
                expect.objectContaining({ name: 'Broccoli', weight: 100 }),
            ],
        }),
    );
    expect(
        await screen.findByRole('button', { name: 'Edit meal' }),
    ).toBeInTheDocument();
});

it('saves with no steps when the optional Steps tab is cleared', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    await user.click(screen.getByRole('tab', { name: 'Steps (optional)' }));
    const instructions = screen.getByRole('textbox', {
        name: 'Instructions',
    });
    expect(instructions).toHaveValue('Cook: Stir for 2 minutes.');
    await user.clear(instructions);
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ instructions: [] }),
    );
});

it('cancels unfinished edits and validates a blank recipe name', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    const name = screen.getByRole('textbox', { name: 'Recipe name' });
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a recipe name');
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(
        screen.getByRole('heading', { name: 'Tofu bowl' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    expect(screen.getByRole('textbox', { name: 'Recipe name' })).toHaveValue(
        'Tofu bowl',
    );
});

it('keeps the edit form available for retry when saving fails', async () => {
    const save = vi
        .fn<(value: Recipe) => Promise<Recipe>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(async (value) => value);
    const { user } = setup(save);
    await user.click(screen.getByRole('button', { name: 'Edit meal' }));
    const name = screen.getByRole('textbox', { name: 'Recipe name' });
    await user.clear(name);
    await user.type(name, 'Crispy tofu bowl');
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save your recipe',
    );
    expect(name).toHaveValue('Crispy tofu bowl');
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(
        await screen.findByRole('heading', { name: 'Crispy tofu bowl' }),
    ).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2);
});
