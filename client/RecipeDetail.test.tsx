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
import { useState, type ComponentProps } from 'react';
import RecipeDetail, { type RecipeNameEditor } from './RecipeDetail';
import PageHeader from './navigation/PageHeader';
import type { Recipe } from '../shared/types/recipe';
import type { IngredientInfo } from '../shared/types/types';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import * as micronutrientService from './services/micronutrientService';
import * as recipeService from './services/recipeService';
import { useMicronutrientLookup } from './hooks/useMicronutrientLookup';

vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: vi.fn(() => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    })),
}));

beforeEach(() => {
    mockPickerEnvironment(true);
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

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
            thumbnailSource: 'nutrition-lab',
        },
    ],
    instructions: ['Cook: Stir for 2 minutes.'],
};

/** Recipe Detail with the app header, which holds the name edit ✕ / ✓. */
function RecipeDetailPage(props: ComponentProps<typeof RecipeDetail>) {
    const [nameEditor, setNameEditor] = useState<RecipeNameEditor | null>(null);
    return (
        <>
            <PageHeader
                currentPage="recipe-detail"
                themed
                editor={
                    nameEditor ? { ...nameEditor, subject: 'meal' } : undefined
                }
                onBack={vi.fn()}
                onOpenMenu={vi.fn()}
                onSignOut={vi.fn()}
                menuOpen={false}
                menuButtonRef={{ current: null }}
            />
            <RecipeDetail {...props} onNameEditingChange={setNameEditor} />
        </>
    );
}

function setup(save = vi.fn(async (value: Recipe) => value)) {
    render(
        <RecipeDetailPage
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
        />,
    );
    return { user: userEvent.setup(), save };
}

it('shows the nutrition overview without an extra Nutrition heading', () => {
    setup();
    expect(
        screen.getByRole('group', { name: 'Meal nutrition summary' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: /^Nutrition$/ }),
    ).not.toBeInTheDocument();
});

it('keeps the recipe title and overview mounted while editing ingredients', async () => {
    const { user } = setup();
    const title = screen.getByRole('button', {
        name: 'Edit recipe name, Tofu bowl',
    });
    const overview = screen.getByRole('group', {
        name: 'Meal nutrition summary',
    });
    const tabs = screen.getByRole('tablist', { name: 'Recipe details' });

    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));

    expect(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    ).toBe(title);
    expect(title).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Meal nutrition summary' })).toBe(
        overview,
    );
    expect(screen.getByRole('tablist', { name: 'Recipe details' })).toBe(tabs);
});

it('persists only missing lookup values and keeps saved values through a recipe edit', async () => {
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: {
            tofu: { name: 'Tofu', ironPer100g: 9, zincPer100g: 1.5 },
        },
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
    const persist = vi
        .spyOn(recipeService, 'fillRecipeNutrition')
        .mockResolvedValue(undefined);
    const save = vi.fn(async (value: Recipe) => value);
    render(
        <RecipeDetail
            recipe={{
                ...recipe,
                ingredients: [{ ...recipe.ingredients[0], ironPer100g: 0 }],
            }}
            onSave={save}
        />,
    );
    await waitFor(() => expect(persist).toHaveBeenCalledOnce());
    expect(persist).toHaveBeenCalledWith('meal-1', [
        { index: 0, name: 'Tofu', nutrients: { zincPer100g: 1.5 } },
    ]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].ingredients[0]).toMatchObject({
        ironPer100g: 0,
        zincPer100g: 1.5,
    });
});

it('persists nutrients found during a save once after the recipe update', async () => {
    let finishSave!: () => void;
    const save = vi.fn(
        (value: Recipe) =>
            new Promise<Recipe>((resolve) => {
                finishSave = () => resolve(value);
            }),
    );
    const persist = vi
        .spyOn(recipeService, 'fillRecipeNutrition')
        .mockResolvedValue(undefined);
    const { rerender } = render(<RecipeDetail recipe={recipe} onSave={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());

    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: { tofu: { name: 'Tofu', zincPer100g: 1.5 } },
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
    rerender(<RecipeDetail recipe={recipe} onSave={save} />);
    expect(persist).not.toHaveBeenCalled();

    await act(async () => finishSave());
    await waitFor(() => expect(persist).toHaveBeenCalledOnce());
    expect(persist).toHaveBeenCalledWith('meal-1', [
        { index: 0, name: 'Tofu', nutrients: { zincPer100g: 1.5 } },
    ]);
});

it('shows the My Diary add action without a saved star', () => {
    setup();
    expect(
        screen.getByRole('button', { name: 'Add to My Diary' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('img', { name: 'Saved to My Meals' }),
    ).not.toBeInTheDocument();
});

it('keeps the My Diary action while editing ingredients', async () => {
    const user = userEvent.setup();
    render(
        <RecipeDetail
            recipe={{
                ...recipe,
                recipeName: 'Buckwheat and Brown Rice Tofu Bowl',
            }}
            onSave={vi.fn()}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    expect(
        screen.getByRole('heading', {
            name: 'Buckwheat and Brown Rice Tofu Bowl',
        }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', {
            name: 'Edit recipe name, Buckwheat and Brown Rice Tofu Bowl',
        }),
    ).toBeDisabled();
    expect(
        screen.getByRole('button', { name: 'Add to My Diary' }),
    ).toBeInTheDocument();
});

it('edits the recipe name in place and saves only after confirmation', async () => {
    const { user, save } = setup();
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    expect(
        screen.getByRole('heading', { name: 'Tofu bowl' }),
    ).toBeInTheDocument();
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    expect(
        screen.queryByRole('img', { name: 'Saved to My Meals' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Add to My Diary' }),
    ).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Meal name' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
    await user.clear(name);
    await user.type(name, 'Crispy tofu bowl');
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            recipeName: 'Crispy tofu bowl',
            ingredients: [expect.objectContaining({ weight: 100 })],
        }),
    );
    expect(
        await screen.findByRole('heading', { name: 'Crispy tofu bowl' }),
    ).toBeInTheDocument();
});

it('opens ingredient editing immediately from the list Edit action', () => {
    render(<RecipeDetail recipe={recipe} onSave={vi.fn()} startInEditMode />);
    expect(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Add ingredient' }),
    ).toBeInTheDocument();
});

it('opens ingredient nutrition from the shared ingredient row', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Tofu' }));

    expect(
        await screen.findByRole('dialog', { name: 'Ingredient nutrition' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('heading', { name: 'Firm tofu' }),
    ).toBeInTheDocument();
});

it('deletes an ingredient from the edit row context menu and saves the change', async () => {
    const save = vi.fn(async (value: Recipe) => value);
    render(
        <RecipeDetail
            recipe={{
                ...recipe,
                ingredients: [
                    ...recipe.ingredients,
                    {
                        name: 'Broccoli',
                        weight: 100,
                        caloriesPer100g: 34,
                        proteinPer100g: 2.8,
                        carbohydratePer100g: 6.6,
                        fatPer100g: 0.4,
                    },
                ],
            }}
            onSave={save}
            startInEditMode
        />,
    );
    const row = screen.getByLabelText(/Tofu, swipe left or press Left Arrow/);
    fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });
    expect(
        screen.getByRole('menu', { name: 'Tofu actions' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('menuitem', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => expect(row).not.toBeInTheDocument());
    expect(save).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].ingredients.map(({ name }) => name)).toEqual([
        'Broccoli',
    ]);
});

it('finishes a name edit immediately when the saved name is unchanged', async () => {
    const { user, save } = setup();
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));

    expect(save).not.toHaveBeenCalled();
    expect(
        screen.queryByRole('textbox', { name: 'Meal name' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('heading', { name: 'Tofu bowl' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Saving changes…')).not.toBeInTheDocument();
});

it('edits ingredient weights without changing the recipe name or steps', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    expect(
        within(screen.getByRole('region', { name: 'Ingredients' })).queryByRole(
            'heading',
            { name: 'Ingredients' },
        ),
    ).not.toBeInTheDocument();
    // The chevron is hidden but keeps its space, so names never rewrap.
    expect(
        document.querySelector(
            '.ingredient-name-chevron:not(.ingredient-name-chevron-space)',
        ),
    ).toBeNull();
    expect(
        document.querySelector('.ingredient-name-chevron-space'),
    ).toBeInTheDocument();
    expect(document.querySelector('.meal-ingredient-remove')).toBeNull();
    expect(
        screen.getByLabelText(/Tofu, swipe left or press Left Arrow/),
    ).toBeInTheDocument();
    const weight = screen.getByRole('spinbutton', {
        name: 'Tofu weight in grams',
    });
    await user.clear(weight);
    await user.type(weight, '200');
    const summary = screen.getByRole('group', {
        name: 'Meal nutrition summary',
    });
    expect(summary).toHaveTextContent('260kcal');
    expect(summary).toHaveTextContent('30g');
    expect(
        screen.getByRole('meter', { name: 'Tofu calorie contribution' }),
    ).toHaveAttribute('aria-valuetext', '260 kcal');
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            recipeName: 'Tofu bowl',
            instructions: ['Cook: Stir for 2 minutes.'],
            ingredients: [
                expect.objectContaining({ weight: 200, sugarPer100g: 1 }),
            ],
        }),
    );
    expect(screen.getByText('200 g')).toBeInTheDocument();
    expect(screen.getByText('Ingredients updated.')).toBeInTheDocument();
});

it('finishes an unchanged ingredient edit without a save request', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Decrease Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('100 g')).toBeInTheDocument();
    expect(
        screen.queryByRole('spinbutton', { name: 'Tofu weight in grams' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Saving changes…')).not.toBeInTheDocument();
    expect(screen.queryByText('Ingredients updated.')).not.toBeInTheDocument();
});

it('shows saving feedback while a recipe update is pending', async () => {
    let finishSave!: () => void;
    const save = vi.fn(
        (value: Recipe) =>
            new Promise<Recipe>((resolve) => {
                finishSave = () => resolve(value);
            }),
    );
    const { user } = setup(save);
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    expect(screen.getByText('Saving ingredients…')).toBeInTheDocument();
    expect(
        screen.getByText('Saving ingredients…').closest('[role="status"]'),
    ).toContainElement(document.querySelector('.loading-spinner'));
    expect(
        screen.queryByRole('button', { name: 'Save ingredients changes' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('105 g')).toBeInTheDocument();
    expect(save).toHaveBeenCalledOnce();

    await act(async () => finishSave());
    expect(screen.getByText('105 g')).toBeInTheDocument();
    expect(screen.getByText('Ingredients updated.')).toBeInTheDocument();
    expect(
        document.querySelector('.recipe-detail-saving-announcement'),
    ).toHaveTextContent('');
});

it('restores ingredient editing with the entered changes if saving fails', async () => {
    const save = vi.fn(async () => {
        throw new Error('Offline');
    });
    const { user } = setup(save);
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    expect(
        await screen.findByRole('button', { name: 'Save ingredients changes' }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('105')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not save your changes',
    );
    expect(screen.queryByText('Ingredients updated.')).not.toBeInTheDocument();
});

it('adds and saves an ingredient when the section tick is tapped while its name is focused', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Cancel ingredients changes' }),
    );
    expect(screen.getByText('100 g')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('img', { name: 'Default recipe image' }),
    ).not.toBeInTheDocument();
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'Broccoli',
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            ingredients: [
                expect.objectContaining({ name: 'Tofu' }),
                expect.objectContaining({ name: 'Broccoli' }),
            ],
        }),
    );
});

it('shows a calorie track while adding an ingredient and keeps it after commit', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(
        screen.getByRole('meter', { name: 'Ingredient calorie contribution' }),
    ).toHaveAttribute('aria-valuetext', 'Calories unavailable');

    const input = screen.getByRole('combobox', { name: 'Ingredient 2' });
    await user.type(input, 'Broccoli');
    expect(
        screen.getByRole('meter', { name: 'Broccoli calorie contribution' }),
    ).toHaveAttribute('aria-valuetext', '34 kcal');

    await user.keyboard('{Enter}');
    expect(
        screen.getByRole('meter', { name: 'Broccoli calorie contribution' }),
    ).toHaveAttribute('aria-valuetext', '34 kcal');
});

it('reuses nutrition from an existing recipe ingredient when its name is entered again', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    const input = screen.getByRole('combobox', { name: 'Ingredient 2' });
    await user.type(input, 'tofu');
    expect(
        screen.getByRole('meter', { name: 'tofu calorie contribution' }),
    ).toHaveAttribute('aria-valuetext', '130 kcal');

    await user.keyboard('{Enter}');
    expect(
        screen.getAllByRole('meter', {
            name: 'Tofu calorie contribution',
        }),
    ).toHaveLength(2);
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].ingredients[1]).toEqual(
        expect.objectContaining({
            name: 'Tofu',
            caloriesPer100g: 130,
            weight: 100,
        }),
    );
    expect(save.mock.calls[0][0].ingredients[1]).not.toHaveProperty(
        'nutritionUnavailable',
        true,
    );
});

it('saves an unfamiliar ingredient name without opening the nutrition sheet', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'sdfadf"',
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            ingredients: [
                expect.objectContaining({ name: 'Tofu' }),
                expect.objectContaining({
                    name: 'sdfadf"',
                    nutritionUnavailable: true,
                }),
            ],
        }),
    );
    expect(
        screen.queryByRole('dialog', { name: 'Ingredient nutrition' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('group', { name: 'Meal nutrition summary' }),
    ).toHaveTextContent('130kcal');
    expect(
        screen.getByRole('group', { name: 'Meal nutrition summary' }),
    ).toHaveClass('meal-result-summary-overview');
    expect(
        screen.getByRole('group', { name: 'Meal nutrition summary' }),
    ).toHaveTextContent('15g');
    expect(
        screen.getByRole('group', { name: 'Meal nutrition summary' }),
    ).toHaveTextContent('2g');
    expect(
        screen.getByRole('group', { name: 'Meal nutrition summary' }),
    ).toHaveTextContent('Based on ingredients with available nutrition data');
    const nutritionInfo = screen.getByRole('button', {
        name: 'About nutrition data',
    });
    expect(
        document.getElementById(nutritionInfo.getAttribute('popovertarget')!),
    ).toHaveTextContent('Based on ingredients with available nutrition data');
    expect(
        document.querySelector(
            '.meal-nutrition-section .nutrition-overview-partial',
        ),
    ).not.toBeInTheDocument();
});

it('updates a newly added ingredient when its nutrition lookup succeeds', async () => {
    vi.spyOn(micronutrientService, 'getIngredientNutrition').mockResolvedValue({
        name: 'Brown rice',
        caloriesPer100g: 110,
        proteinPer100g: 2.6,
        carbohydratePer100g: 23,
        fatPer100g: 0.9,
    });
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'brown rice',
    );
    await user.keyboard('{Enter}');

    await waitFor(() =>
        expect(
            screen.getByRole('meter', {
                name: 'brown rice calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '110 kcal'),
    );
    expect(
        screen.queryByRole('button', {
            name: 'Nutrition unavailable for brown rice',
        }),
    ).not.toBeInTheDocument();

    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].ingredients[1]).toEqual(
        expect.objectContaining({
            name: 'brown rice',
            weight: 100,
            caloriesPer100g: 110,
        }),
    );
    expect(save.mock.calls[0][0].ingredients[1]).not.toHaveProperty(
        'nutritionUnavailable',
        true,
    );
});

it('uses previously looked-up nutrition immediately when adding an ingredient', async () => {
    vi.spyOn(
        micronutrientService,
        'getCachedIngredientNutrition',
    ).mockReturnValue({
        name: 'Rice, dry',
        caloriesPer100g: 360,
        proteinPer100g: 7,
        carbohydratePer100g: 79,
        fatPer100g: 1,
    });
    const lookup = vi.spyOn(micronutrientService, 'getIngredientNutrition');
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'cached rice{Enter}',
    );

    expect(
        screen.getByRole('meter', {
            name: 'cached rice calorie contribution',
        }),
    ).toHaveAttribute('aria-valuetext', '360 kcal');
    expect(lookup).not.toHaveBeenCalled();
});

it('fills a typed common food immediately on Enter', async () => {
    const lookup = vi.spyOn(micronutrientService, 'getIngredientNutrition');
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'banana{Enter}',
    );

    expect(
        screen.getByRole('meter', {
            name: 'Banana calorie contribution',
        }),
    ).toHaveAttribute('aria-valuetext', '89 kcal');
    expect(lookup).not.toHaveBeenCalled();
});

it('shows the unavailable warning only after a new ingredient lookup fails', async () => {
    let rejectLookup!: (reason?: unknown) => void;
    vi.spyOn(micronutrientService, 'getIngredientNutrition').mockReturnValue(
        new Promise((_, reject) => {
            rejectLookup = reject;
        }),
    );
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'unknown rice',
    );
    await user.keyboard('{Enter}');

    expect(
        screen.queryByRole('button', {
            name: 'Nutrition unavailable for unknown rice',
        }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('meter', {
            name: 'unknown rice calorie contribution',
        }),
    ).toHaveAttribute('aria-valuetext', 'Calories unavailable');

    await act(async () => rejectLookup(new Error('No nutrition found')));
    expect(
        screen.getByRole('button', {
            name: 'Nutrition unavailable for unknown rice',
        }),
    ).toBeInTheDocument();
});

it('keeps a pending nutrition lookup with its ingredient when another row is removed', async () => {
    let finishLookup!: (value: IngredientInfo) => void;
    vi.spyOn(micronutrientService, 'getIngredientNutrition').mockReturnValue(
        new Promise<IngredientInfo>((resolve) => {
            finishLookup = resolve;
        }),
    );
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'unknown rice',
    );
    await user.keyboard('{Enter}');

    fireEvent.contextMenu(
        screen.getByLabelText(/Tofu, swipe left or press Left Arrow/),
        { button: 2, clientX: 120, clientY: 140 },
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await act(async () =>
        finishLookup({
            name: 'Rice, cooked',
            caloriesPer100g: 111,
            proteinPer100g: 2.5,
            carbohydratePer100g: 24,
            fatPer100g: 0.8,
        }),
    );
    expect(
        screen.getByRole('meter', {
            name: 'unknown rice calorie contribution',
        }),
    ).toHaveAttribute('aria-valuetext', '111 kcal');
});

it('keeps the nutrition warning hidden while a saved ingredient lookup is pending', async () => {
    let rejectLookup!: (reason?: unknown) => void;
    vi.spyOn(micronutrientService, 'getIngredientNutrition').mockReturnValue(
        new Promise((_, reject) => {
            rejectLookup = reject;
        }),
    );
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'unknown grain',
    );
    await user.keyboard('{Enter}');
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());

    expect(
        screen.queryByRole('button', {
            name: 'Nutrition unavailable for unknown grain',
        }),
    ).not.toBeInTheDocument();

    await act(async () => rejectLookup(new Error('No nutrition found')));
    expect(
        screen.getByRole('button', {
            name: 'Nutrition unavailable for unknown grain',
        }),
    ).toBeInTheDocument();
});

it('cancels a typed new ingredient without adding it on blur', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'Broccoli',
    );
    await user.click(
        screen.getByRole('button', { name: 'Cancel adding ingredient' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    expect(save).not.toHaveBeenCalled();
    expect(
        screen.queryByRole('button', { name: 'Broccoli' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Edit ingredients' }),
    ).toBeInTheDocument();
});

it('dismisses an empty new row and finishes an unchanged ingredient edit with one tick', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('100 g')).toBeInTheDocument();
    expect(
        screen.queryByRole('combobox', { name: 'Ingredient 2' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Edit ingredients' }),
    ).toBeInTheDocument();
});

it('saves weight changes when the new ingredient row is empty', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(
        screen.getByRole('button', { name: 'Increase Tofu by 5 grams' }),
    );
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            ingredients: [
                expect.objectContaining({ name: 'Tofu', weight: 105 }),
            ],
        }),
    );
});

it('edits steps separately and allows them to be cleared', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('tab', { name: 'Steps' }));
    await user.click(screen.getByRole('button', { name: 'Edit steps' }));
    const instructions = screen.getByRole('textbox', { name: 'Instructions' });
    await user.clear(instructions);
    await user.click(
        screen.getByRole('button', { name: 'Save steps changes' }),
    );
    await waitFor(() =>
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ instructions: [] }),
        ),
    );
    expect(
        within(screen.getByRole('tabpanel', { name: 'Steps' })).getByText(
            'No steps added.',
        ),
    ).toBeInTheDocument();
});

it('keeps an unsaved section available when saving fails', async () => {
    const save = vi
        .fn<(value: Recipe) => Promise<Recipe>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(async (value) => value);
    const { user } = setup(save);
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    const name = screen.getByRole('textbox', { name: 'Meal name' });
    await user.clear(name);
    await user.type(name, 'Crispy tofu bowl');
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save',
    );
    expect(name).toHaveValue('Crispy tofu bowl');
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));
    expect(
        await screen.findByRole('heading', { name: 'Crispy tofu bowl' }),
    ).toBeInTheDocument();
});

it('rejects a blank name and restores the saved name on cancel', async () => {
    const { user, save } = setup();
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    await user.clear(screen.getByRole('textbox', { name: 'Meal name' }));
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a recipe name');
    expect(save).not.toHaveBeenCalled();
    await user.click(
        screen.getByRole('button', { name: 'Cancel name changes' }),
    );
    expect(
        screen.getByRole('heading', { name: 'Tofu bowl' }),
    ).toBeInTheDocument();
});

it('offers Undo after removing an ingredient and restores it in place', async () => {
    let finishLookup!: (value: IngredientInfo) => void;
    vi.spyOn(micronutrientService, 'getIngredientNutrition').mockReturnValue(
        new Promise<IngredientInfo>((resolve) => {
            finishLookup = resolve;
        }),
    );
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'unknown rice',
    );
    await user.keyboard('{Enter}');

    fireEvent.contextMenu(
        screen.getByLabelText(/Tofu, swipe left or press Left Arrow/),
        { button: 2, clientX: 120, clientY: 140 },
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(await screen.findByText('Ingredient removed.')).toBeInTheDocument();
    expect(
        screen.queryByLabelText(/Tofu, swipe left or press Left Arrow/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    const rows = screen.getAllByLabelText(/swipe left or press Left Arrow/);
    expect(rows[0]).toHaveAccessibleName(/^Tofu,/);
    expect(screen.queryByText('Ingredient removed.')).not.toBeInTheDocument();

    // A lookup that was running still lands on its own ingredient.
    await act(async () =>
        finishLookup({
            name: 'Rice, cooked',
            caloriesPer100g: 111,
            proteinPer100g: 2.5,
            carbohydratePer100g: 24,
            fatPer100g: 0.8,
        }),
    );
    expect(
        screen.getByRole('meter', {
            name: 'unknown rice calorie contribution',
        }),
    ).toHaveAttribute('aria-valuetext', '111 kcal');
});

it('drops the Undo toast once ingredient changes are saved', async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 2' }),
        'Broccoli',
    );
    await user.keyboard('{Enter}');
    fireEvent.contextMenu(
        screen.getByLabelText(/Tofu, swipe left or press Left Arrow/),
        { button: 2, clientX: 120, clientY: 140 },
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await screen.findByText('Ingredient removed.');

    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.queryByText('Ingredient removed.')).not.toBeInTheDocument();
    expect(save.mock.calls[0][0].ingredients).not.toContainEqual(
        expect.objectContaining({ name: 'Tofu' }),
    );
});

it('shows a My Diary meal with a star that confirms saving to My Recipes at once', async () => {
    let finishSave!: () => void;
    const saveRecipe = vi.spyOn(recipeService, 'saveRecipe').mockImplementation(
        (value) =>
            new Promise((resolve) => {
                finishSave = () =>
                    resolve({ ...value, id: 'saved-1', userId: 'user-1' });
            }),
    );
    const onSavedRecipesChange = vi.fn();
    const user = userEvent.setup();
    render(
        <RecipeDetail
            recipe={{ ...recipe, id: undefined, instructions: [] }}
            variant="plan-meal"
            onSave={vi.fn()}
            onSavedRecipesChange={onSavedRecipesChange}
        />,
    );
    expect(
        screen.queryByRole('button', { name: /My Diary/ }),
    ).not.toBeInTheDocument();
    // Plan meals have no steps; the name and ingredients are editable.
    expect(screen.queryByRole('button', { name: 'Edit steps' })).toBeNull();
    expect(
        screen.getByRole('button', { name: 'Edit ingredients' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save this meal' }));
    // The toast and the filled star appear before the save finishes.
    expect(screen.getByText('Saved to My Recipes.')).toBeVisible();
    expect(
        screen.getByRole('button', { name: 'Remove this meal from saved' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(saveRecipe).toHaveBeenCalledWith(
        expect.objectContaining({
            recipeName: recipe.recipeName,
            ingredients: [expect.objectContaining({ weight: 100 })],
            instructions: [],
        }),
    );
    await act(async () => finishSave());
    expect(onSavedRecipesChange).toHaveBeenCalledOnce();
});

it('takes back the saved confirmation when saving to My Recipes fails', async () => {
    vi.spyOn(recipeService, 'saveRecipe').mockRejectedValue(
        new Error('offline'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(
        <RecipeDetail
            recipe={{ ...recipe, id: undefined, instructions: [] }}
            variant="plan-meal"
            onSave={vi.fn()}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Save this meal' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save this meal',
    );
    expect(screen.queryByText('Saved to My Recipes.')).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Save this meal' }),
    ).toHaveAttribute('aria-pressed', 'false');
});

it('saves ingredient weight edits of a My Diary meal through onSave', async () => {
    const save = vi.fn(async (value: Recipe) => value);
    const user = userEvent.setup();
    render(
        <RecipeDetail
            recipe={{ ...recipe, id: undefined, instructions: [] }}
            variant="plan-meal"
            onSave={save}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit ingredients' }));
    const weight = screen.getByRole('spinbutton', {
        name: 'Tofu weight in grams',
    });
    await user.clear(weight);
    await user.type(weight, '200');
    await user.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].ingredients).toEqual([
        expect.objectContaining({ name: 'Tofu', weight: 200 }),
    ]);
});

it('edits a long name in a full-width field confirmed from the header', async () => {
    const { user, save } = setup();
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    expect(screen.getByText('Edit Name')).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
    // The + stays, so the field keeps the heading's width.
    expect(
        screen.getByRole('button', { name: 'Add to My Diary' }),
    ).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Meal name' });
    expect(name.tagName).toBe('TEXTAREA');
    expect(name).toHaveFocus();

    // Esc cancels.
    await user.type(name, ' extra');
    await user.keyboard('{Escape}');
    expect(
        screen.getByRole('heading', { name: 'Tofu bowl' }),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();

    // Pasted line breaks become spaces, and Enter saves.
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    const field = screen.getByRole('textbox', { name: 'Meal name' });
    await user.clear(field);
    await user.click(field);
    await user.paste('Overnight oats with chia,\nblueberries and almonds');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].recipeName).toBe(
        'Overnight oats with chia, blueberries and almonds',
    );
    expect(
        await screen.findByRole('heading', {
            name: 'Overnight oats with chia, blueberries and almonds',
        }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
});

it('renames a My Diary meal from the same header controls', async () => {
    const save = vi.fn(async (value: Recipe) => value);
    const user = userEvent.setup();
    render(
        <RecipeDetailPage
            recipe={{ ...recipe, id: undefined, instructions: [] }}
            variant="plan-meal"
            onSave={save}
        />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Edit recipe name, Tofu bowl' }),
    );
    expect(screen.getByText('Edit Name')).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Meal name' });
    expect(name.tagName).toBe('TEXTAREA');
    // The star stays, so the field keeps the heading's width.
    expect(
        screen.getByRole('button', { name: 'Save this meal' }),
    ).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Tuesday tofu bowl');
    await user.click(screen.getByRole('button', { name: 'Save name changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].recipeName).toBe('Tuesday tofu bowl');
    expect(
        await screen.findByRole('heading', { name: 'Tuesday tofu bowl' }),
    ).toBeInTheDocument();
});
