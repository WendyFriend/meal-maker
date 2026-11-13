import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreateRecipe from './CreateRecipe';
import { mockPickerEnvironment } from './test/pickerEnvironment';

beforeEach(() => mockPickerEnvironment(true));
afterEach(() => vi.unstubAllGlobals());

vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));

it('adds editable ingredient rows, previews nutrition, and saves from the two-tab form', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
        <CreateRecipe
            savedIngredients={[
                {
                    ingredientId: 'tofu-1',
                    name: 'Tofu',
                    caloriesPer100g: 130,
                    proteinPer100g: 15,
                    carbohydratePer100g: 5,
                    fatPer100g: 4,
                    fiberPer100g: 1,
                },
            ]}
            onSave={save}
        />,
    );

    expect(
        screen.getByRole('img', { name: 'Default recipe image' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('tab', { name: 'Ingredients & Nutrition' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
        screen.queryByRole('group', { name: 'Meal nutrition summary' }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('combobox', { name: 'Ingredient 1' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    const row = screen.getByRole('combobox', { name: 'Ingredient 1' });
    expect(row).toHaveFocus();
    expect(
        screen.getByRole('spinbutton', {
            name: 'Ingredient 1 weight in grams',
        }),
    ).toBeInTheDocument();

    await user.type(
        screen.getByRole('textbox', { name: 'Recipe name' }),
        'Tofu bowl',
    );
    await user.type(row, 'To');
    const suggestions = screen.getByRole('listbox');
    expect(suggestions).not.toHaveTextContent(/Saved|Suggested|Custom/);
    await user.click(within(suggestions).getByRole('option', { name: 'Tofu' }));
    const ingredientName = screen.getByRole('button', {
        name: 'View Tofu nutrition',
    });
    expect(
        screen.queryByRole('meter', { name: 'Tofu calorie contribution' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nutrition per 100 g/)).not.toBeInTheDocument();
    await user.click(ingredientName);
    expect(
        screen.getByRole('dialog', { name: 'Ingredient nutrition' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() =>
        expect(
            screen.queryByRole('dialog', { name: 'Ingredient nutrition' }),
        ).not.toBeInTheDocument(),
    );
    const weight = screen.getByRole('spinbutton', {
        name: 'Ingredient 1 weight in grams',
    });
    await user.clear(weight);
    await user.type(weight, '150');
    expect(
        within(
            screen.getByRole('region', { name: 'Nutrition overview' }),
        ).getByText('195'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Steps' }));
    await user.type(
        screen.getByRole('textbox', { name: 'Instructions' }),
        'Cook the tofu.',
    );
    fireEvent.submit(document.getElementById('create-recipe-form')!);

    expect(save).toHaveBeenCalledWith({
        recipeName: 'Tofu bowl',
        ingredients: [
            expect.objectContaining({
                name: 'Tofu',
                weight: 150,
                caloriesPer100g: 130,
                proteinPer100g: 15,
                carbohydratePer100g: 5,
                fatPer100g: 4,
                fiberPer100g: 1,
            }),
        ],
        instructions: ['Cook the tofu.'],
    });
});

it('saves a recipe without instructions', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
        <CreateRecipe
            savedIngredients={[
                {
                    ingredientId: 'tofu-1',
                    name: 'Tofu',
                    caloriesPer100g: 130,
                    proteinPer100g: 15,
                    carbohydratePer100g: 5,
                    fatPer100g: 4,
                },
            ]}
            onSave={save}
        />,
    );

    await user.type(
        screen.getByRole('textbox', { name: 'Recipe name' }),
        'Tofu bowl',
    );
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 1' }),
        'Tofu{Enter}',
    );
    fireEvent.submit(document.getElementById('create-recipe-form')!);

    expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
            recipeName: 'Tofu bowl',
            instructions: [],
        }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['create', 'edit'])(
    'selects Nutrition Lab food and carries its nutrition into %s mode',
    async (mode) => {
        const search = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                results: [
                    {
                        fdcId: 992345,
                        name: 'Purple yam, cooked',
                        description: 'Boiled root',
                        per100g: {
                            kcal: 120,
                            proteinG: 2,
                            carbsG: 27,
                            fatG: 0.1,
                        },
                    },
                ],
            }),
        });
        vi.stubGlobal('fetch', search);
        const user = userEvent.setup();
        render(
            <CreateRecipe
                savedIngredients={[]}
                onSave={vi.fn()}
                initialRecipe={
                    mode === 'edit'
                        ? {
                              recipeName: 'Yam bowl',
                              ingredients: [],
                              instructions: [],
                          }
                        : undefined
                }
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Add ingredient' }),
        );
        await user.type(
            screen.getByRole('combobox', { name: 'Ingredient 1' }),
            'purple yam',
        );
        const option = await screen.findByRole('option', {
            name: 'Purple yam, cooked',
        });
        const manual = screen.getByRole('option', {
            name: 'Enter purple yam manually',
        });
        expect(screen.getAllByRole('option')[0]).toBe(manual);
        expect(manual).toHaveTextContent('+ purple yam');
        expect(manual).toHaveTextContent('↵');
        expect(manual).toHaveAttribute('aria-selected', 'true');
        expect(option).not.toHaveTextContent('Boiled root');
        await user.click(option);
        expect(
            screen.getByRole('button', {
                name: 'View Purple yam, cooked nutrition',
            }),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole('region', { name: 'Nutrition overview' }),
            ).getByText('120'),
        ).toBeInTheDocument();
        if (mode === 'create')
            expect(search).toHaveBeenCalledWith(
                '/api/food-search?q=purple%20yam',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
    },
);

it('lets a recipe use an ingredient that is absent from Nutrition Lab', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ results: [] }),
        }),
    );
    const user = userEvent.setup();
    render(<CreateRecipe savedIngredients={[]} onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 1' }),
        'Moonbean',
    );
    await screen.findByRole('option', {
        name: 'Enter Moonbean manually',
    });
    await user.click(
        screen.getByRole('option', { name: 'Enter Moonbean manually' }),
    );
    await user.click(
        screen.getByRole('button', { name: /View Moonbean nutrition/ }),
    );
    expect(
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    ).toBeInTheDocument();
    await user.click(
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
    for (const [label, value] of [
        ['Calories', '95'],
        ['Protein', '5'],
        ['Carbohydrate', '12'],
        ['Total fat', '3'],
    ]) {
        await user.type(
            screen.getByRole('spinbutton', {
                name: `${label} per 100 grams`,
            }),
            value,
        );
    }
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() =>
        expect(
            within(
                screen.getByRole('region', { name: 'Nutrition overview' }),
            ).getByText('95'),
        ).toBeInTheDocument(),
    );
});

it('supports keyboard selection from ingredient suggestions', async () => {
    const user = userEvent.setup();
    render(<CreateRecipe savedIngredients={[]} onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    const input = screen.getByRole('combobox', { name: 'Ingredient 1' });
    await user.type(input, 'spin');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(
        screen.getByRole('button', { name: 'View Spinach nutrition' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('commits an ingredient with Return without submitting the recipe', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<CreateRecipe savedIngredients={[]} onSave={save} />);
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    const input = screen.getByRole('combobox', { name: 'Ingredient 1' });
    await user.type(input, 'Spinach{Enter}');
    expect(
        screen.getByRole('button', { name: 'View Spinach nutrition' }),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
});

it.each(['create', 'edit'])(
    'removes an ingredient by swiping left in %s mode',
    async (mode) => {
        const user = userEvent.setup();
        const { container } = render(
            <CreateRecipe
                savedIngredients={[]}
                onSave={vi.fn()}
                initialRecipe={
                    mode === 'edit'
                        ? {
                              recipeName: 'Tofu bowl',
                              ingredients: [
                                  {
                                      name: 'Tofu',
                                      weight: 100,
                                      caloriesPer100g: 130,
                                      proteinPer100g: 15,
                                      carbohydratePer100g: 5,
                                      fatPer100g: 4,
                                  },
                              ],
                              instructions: [],
                          }
                        : undefined
                }
            />,
        );
        if (mode === 'create') {
            await user.click(
                screen.getByRole('button', { name: 'Add ingredient' }),
            );
        }

        const content = container.querySelector(
            '.meal-ingredient-swipe-content',
        )!;
        const remove = container.querySelector<HTMLButtonElement>(
            '.meal-ingredient-swipe-remove',
        )!;
        expect(remove).toHaveAttribute('aria-hidden', 'true');
        fireEvent.pointerDown(content, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 150,
            clientY: 20,
        });
        fireEvent.pointerMove(content, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 60,
            clientY: 20,
        });
        fireEvent.pointerUp(content, {
            pointerId: 1,
            pointerType: 'touch',
            clientX: 60,
            clientY: 20,
        });
        expect(remove).toHaveAttribute('aria-hidden', 'false');
        await user.click(remove);
        await waitFor(() =>
            expect(
                container.querySelector('.create-recipe-row'),
            ).not.toBeInTheDocument(),
        );
    },
);

it('updates the recipe nutrition preview from the ingredient sheet', async () => {
    const user = userEvent.setup();
    render(
        <CreateRecipe
            savedIngredients={[
                {
                    ingredientId: 'tofu-1',
                    name: 'Tofu',
                    caloriesPer100g: 130,
                    proteinPer100g: 15,
                    carbohydratePer100g: 5,
                    fatPer100g: 4,
                },
            ]}
            onSave={vi.fn()}
        />,
    );
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    await user.type(
        screen.getByRole('combobox', { name: 'Ingredient 1' }),
        'Tofu{Enter}',
    );
    await user.click(
        screen.getByRole('button', { name: 'View Tofu nutrition' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
    const calories = screen.getByRole('spinbutton', {
        name: 'Calories per 100 grams',
    });
    await user.clear(calories);
    await user.type(calories, '200');
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() =>
        expect(
            screen.queryByRole('dialog', { name: 'Ingredient nutrition' }),
        ).not.toBeInTheDocument(),
    );
    expect(
        within(
            screen.getByRole('region', { name: 'Nutrition overview' }),
        ).getByText('200'),
    ).toBeInTheDocument();
});
