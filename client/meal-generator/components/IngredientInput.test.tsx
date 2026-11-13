import { useState } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import IngredientInput from './IngredientInput';
import SelectedIngredients from './SelectedIngredients';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import { groupQuickAddIngredients } from './quickAddIngredients';

const records: UserIngredient[] = [
    'Spinach',
    'Broccoli',
    'Tofu',
    'Brown rice',
    'Olive oil',
    'Mystery spice',
].map((name, index) => ({
    ingredientId: String(index),
    name,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbohydratePer100g: 5,
    fatPer100g: 3,
}));

function Form({
    initial = [] as string[],
    saved = records,
    onEdit = vi.fn(),
    onNutritionSelected = vi.fn(),
}: {
    initial?: string[];
    saved?: UserIngredient[];
    onEdit?: (index: number) => void;
    onNutritionSelected?: (name: string, nutrition: IngredientInfo) => void;
}) {
    const [selected, setSelected] = useState(initial);
    return (
        <>
            <IngredientInput
                ingredients={selected}
                savedIngredients={saved}
                onChange={setSelected}
                onIngredientNutritionSelected={onNutritionSelected}
                removeIngredient={(name) =>
                    setSelected((current) =>
                        current.filter((item) => item !== name),
                    )
                }
            />
            <SelectedIngredients
                ingredients={selected}
                removeIngredient={(name) =>
                    setSelected((current) =>
                        current.filter((item) => item !== name),
                    )
                }
                onIngredientClick={onEdit}
                onClear={() => setSelected([])}
            />
            <button type="button">Outside control</button>
        </>
    );
}

let setMobile: (mobile: boolean) => void;
beforeEach(() => {
    localStorage.removeItem('meal-maker:quick-add-layout');
    setMobile = mockPickerEnvironment();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('does not force the page to scroll when the search receives mobile keyboard focus', () => {
    setMobile(true);
    render(<Form />);
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');

    fireEvent.focus(screen.getByRole('combobox'));

    expect(scrollIntoView).not.toHaveBeenCalled();
});

it('points keyboard focus at the actual custom ingredient option', async () => {
    const user = userEvent.setup();
    render(<Form />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'Paprika');
    await user.keyboard('{ArrowDown}');
    const optionId = input.getAttribute('aria-activedescendant');
    expect(optionId).toBeTruthy();
    expect(document.getElementById(optionId!)).toHaveAttribute(
        'role',
        'option',
    );
    expect(document.getElementById(optionId!)).toHaveTextContent('Paprika');
    await user.keyboard('{Escape}');
    expect(input).not.toHaveAttribute('aria-activedescendant');
});

it('resets keyboard selection to the first option when the query changes', async () => {
    const user = userEvent.setup();
    render(<Form saved={[]} />);
    const input = screen.getByRole('combobox');

    await user.type(input, 'tofu');
    await user.keyboard('{ArrowDown}');
    expect(
        document.getElementById(input.getAttribute('aria-activedescendant')!),
    ).toHaveTextContent('Firm tofu');

    await user.clear(input);
    await user.type(input, 'firm');
    const activeOption = document.getElementById(
        input.getAttribute('aria-activedescendant')!,
    );
    expect(activeOption).toHaveTextContent('+ firm');
    expect(activeOption).toBe(
        within(screen.getByRole('listbox')).getAllByRole('option')[0],
    );
});

it('does not hide suggestions when the search is refocused before the blur delay finishes', () => {
    vi.useFakeTimers();
    render(<Form />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Paprika' } });
    fireEvent.blur(input);
    fireEvent.focus(input);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('listbox')).toBeVisible();
    expect(input).toHaveAttribute('aria-expanded', 'true');
});

describe('ingredient search catalogue', () => {
    it('shows only a spinner while Nutrition Lab search is pending', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => new Promise(() => {})),
        );
        const user = userEvent.setup();
        render(<Form saved={[]} />);

        await user.type(screen.getByRole('combobox'), 'unusual ingredient');
        const status = await screen.findByRole('status', {
            name: 'Searching ingredients',
        });
        expect(status.querySelector('.loading-spinner')).toBeInTheDocument();
        expect(status.textContent).toBe('');
    });

    it('offers Nutrition Lab results while keeping manual entry available', async () => {
        const search = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                results: [
                    {
                        fdcId: 991234,
                        name: 'Dragonfruit, raw',
                        description: 'Fresh fruit',
                        per100g: {
                            kcal: 60,
                            proteinG: 1.2,
                            carbsG: 13,
                            fatG: 0.2,
                        },
                    },
                ],
            }),
        });
        vi.stubGlobal('fetch', search);
        const onNutritionSelected = vi.fn();
        const user = userEvent.setup();
        render(<Form saved={[]} onNutritionSelected={onNutritionSelected} />);

        await user.type(screen.getByRole('combobox'), 'dragonfruit');
        expect(
            within(screen.getByRole('listbox')).getByRole('option', {
                name: /\+ dragonfruit/,
            }),
        ).toBeInTheDocument();
        const result = await screen.findByRole('option', {
            name: 'Dragonfruit, raw',
        });
        expect(result).not.toHaveTextContent('Fresh fruit');
        expect(search).toHaveBeenCalledWith(
            '/api/food-search?q=dragonfruit',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        await user.click(result);
        expect(
            screen.getByRole('button', {
                name: 'Edit nutrition for Dragonfruit, raw',
            }),
        ).toBeInTheDocument();
        expect(onNutritionSelected).toHaveBeenCalledWith(
            'Dragonfruit, raw',
            expect.objectContaining({
                caloriesPer100g: 60,
                nutritionSource: expect.objectContaining({ fdcId: 991234 }),
            }),
        );
    });

    it('puts an unknown typed value above partial catalogue matches', async () => {
        const user = userEvent.setup();
        render(<Form saved={[]} />);

        const input = screen.getByRole('combobox');
        await user.type(input, 'tofu');

        const options = within(screen.getByRole('listbox')).getAllByRole(
            'option',
        );
        expect(options[0]).toHaveTextContent('+ tofu');
        expect(options[1]).toHaveTextContent('Firm tofu');

        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('button', { name: 'Remove tofu' }),
        ).toBeInTheDocument();
    });

    it('shows curated ingredients in search for guests', async () => {
        const user = userEvent.setup();
        render(<Form saved={[]} />);

        await user.type(screen.getByRole('combobox'), 'firm');

        expect(
            within(screen.getByRole('listbox')).getByRole('option', {
                name: 'Firm tofu',
            }),
        ).toBeVisible();
    });

    it('places matching saved ingredients before curated ingredients', async () => {
        const user = userEvent.setup();
        render(
            <Form
                saved={[
                    {
                        ...records[0],
                        ingredientId: 'saved-tomato',
                        name: 'Tomato relish',
                    },
                ]}
            />,
        );

        await user.type(screen.getByRole('combobox'), 'tomato');

        expect(
            within(screen.getByRole('listbox'))
                .getAllByRole('option')
                .map((option) => option.textContent),
        ).toEqual(['Tomato relish', 'Tomato']);
    });

    it('uses the saved record when its name duplicates a curated ingredient', async () => {
        const user = userEvent.setup();
        render(
            <Form
                saved={[
                    {
                        ...records[0],
                        ingredientId: 'saved-spinach',
                        name: 'Spinach',
                    },
                ]}
            />,
        );

        await user.type(screen.getByRole('combobox'), 'spinach');

        const options = within(screen.getByRole('listbox')).getAllByRole(
            'option',
        );
        expect(options).toHaveLength(1);
        expect(options[0].id).toContain('saved:saved-spinach');
    });
});

describe('Favourites sheet integration', () => {
    it('opens saved foods, keeps selections across categories, and returns focus on close', async () => {
        const user = userEvent.setup();
        render(<Form />);
        const trigger = screen.getByRole('button', { name: 'Favourites' });

        await user.click(trigger);
        const sheet = screen.getByRole('dialog', { name: 'Add ingredient' });
        expect(
            within(sheet).getByRole('button', { name: 'Favourites' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await user.click(
            within(sheet).getByRole('button', { name: 'Spinach' }),
        );
        expect(
            screen.getByRole('button', { name: 'Remove Spinach' }),
        ).toBeInTheDocument();

        await user.click(
            within(sheet).getByRole('button', { name: 'Veggies' }),
        );
        await user.click(within(sheet).getByRole('button', { name: 'Tomato' }));
        expect(
            screen.getByRole('button', { name: 'Remove Tomato' }),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);

        await user.click(
            within(sheet).getByRole('button', {
                name: 'Close ingredient picker',
            }),
        );
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(trigger).toHaveFocus();
        });
    });

    it('shows the saved-food empty state without requesting search results', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);

        await user.click(screen.getByRole('button', { name: 'Favourites' }));
        expect(
            screen.getByText('Your saved ingredients will appear here.'),
        ).toBeVisible();
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('Quick add groups', () => {
    it('keeps favourites separate, deduplicates their names and supplies the curated categories', () => {
        const groups = groupQuickAddIngredients([
            ...records,
            { ...records[0], ingredientId: 'duplicate', name: ' SPINACH ' },
        ]);
        expect(groups.saved.map(({ name }) => name)).toEqual(
            records.map(({ name }) => name),
        );
        expect(groups.vegetables.map(({ name }) => name)).toEqual([
            'Tomato',
            'Carrots',
            'Kale',
            'Green cabbage',
            'Spinach',
        ]);
        expect(groups.proteins).toHaveLength(6);
        expect(groups.grains).toHaveLength(5);
        expect(groups['nuts-seeds']).toHaveLength(5);
    });
});

it('adds ingredients on mobile without showing a confirmation', () => {
    setMobile(true);
    render(<Form />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Paprika' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(
        screen.getByRole('button', { name: 'Remove Paprika' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Pumpkin added')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each([
    ['To', 'Tofu', 'Tofu'],
    ['Paprika', 'Paprika', 'Paprika'],
])(
    'adds %s on completed mobile taps without activating a chip underneath',
    async (query, optionName, addedName) => {
        setMobile(true);
        const user = userEvent.setup();
        const edit = vi.fn();
        render(<Form onEdit={edit} />);
        const search = screen.getByRole('combobox');
        await user.type(search, query);
        const option = screen.getByRole('option', {
            name: (name) => name.includes(optionName),
        });
        await user.pointer({ keys: '[TouchA>]', target: option });
        expect(option).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: `Remove ${addedName}` }),
        ).not.toBeInTheDocument();
        await user.pointer({ keys: '[/TouchA]', target: option });
        expect(
            screen.getByRole('button', { name: `Remove ${addedName}` }),
        ).toBeInTheDocument();
        expect(edit).not.toHaveBeenCalled();
        expect(search).toHaveFocus();
        await user.click(
            screen.getByRole('button', {
                name: `Edit nutrition for ${addedName}`,
            }),
        );
        expect(edit).toHaveBeenCalledWith(0);
    },
);

it('does not add a search result when a touch is cancelled', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.type(screen.getByRole('combobox'), 'To');
    const option = screen.getByRole('option', { name: 'Tofu' });
    fireEvent.pointerDown(option, { pointerType: 'touch', pointerId: 1 });
    fireEvent.pointerCancel(option, { pointerType: 'touch', pointerId: 1 });
    expect(option).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Remove Tofu' }),
    ).not.toBeInTheDocument();
});
