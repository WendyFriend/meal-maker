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
import type { UserIngredient } from '../../../shared/types/types';
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

function Form({ initial = [] as string[], saved = records, onEdit = vi.fn() }) {
    const [selected, setSelected] = useState(initial);
    return (
        <>
            <IngredientInput
                ingredients={selected}
                savedIngredients={saved}
                onChange={setSelected}
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

    it('shows curated Quick Add ingredients for guests', async () => {
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

describe('ingredient Quick add integration', () => {
    it.each([
        ['tiles', 'quick-add-picker-options-tiles'],
        ['rows', 'quick-add-picker-options-rows'],
    ])('uses the saved %s mobile option layout', async (layout, className) => {
        setMobile(true);
        localStorage.setItem('meal-maker:quick-add-layout', layout);
        const user = userEvent.setup();
        render(<Form />);

        await user.click(screen.getByRole('button', { name: 'Veggies' }));

        expect(
            screen
                .getByRole('dialog', { name: 'Veggies' })
                .querySelector('.quick-add-picker-options'),
        ).toHaveClass(className);
    });

    it('shows every saved ingredient in the Saved category', async () => {
        const user = userEvent.setup();
        render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Saved' }));
        const picker = screen.getByRole('dialog', { name: 'Saved' });
        for (const ingredient of records)
            expect(
                within(picker).getByRole('button', {
                    name: ingredient.name,
                }),
            ).toBeVisible();
    });

    it('shows the curated common ingredients to every user', async () => {
        const user = userEvent.setup();
        render(<Form saved={[]} />);

        for (const [category, names] of [
            [
                'Veggies',
                ['Tomato', 'Carrots', 'Kale', 'Green cabbage', 'Spinach'],
            ],
            [
                'Protein',
                [
                    'Firm tofu',
                    'Chickpea dry',
                    'Chickpea cooked',
                    'Edamame',
                    'Red split lentils dry',
                    'Tempeh',
                ],
            ],
            [
                'Grains',
                [
                    'Brown rice dry',
                    'Buckwheat dry',
                    'Wholemeal bread',
                    'Pasta',
                    'Rolled oats',
                ],
            ],
            [
                'Nuts & Seeds',
                [
                    'Linseeds',
                    'Walnuts',
                    'Pumpkin seeds',
                    'Chia seeds',
                    'Mixed nuts',
                ],
            ],
        ] as const) {
            await user.click(screen.getByRole('button', { name: category }));
            const picker = screen.getByRole('dialog', { name: category });
            const options = within(
                within(picker).getByRole('group'),
            ).getAllByRole('button');
            expect(options.map((button) => button.textContent)).toEqual(names);
            for (const option of options)
                expect(
                    option.querySelector('.meal-ingredient-thumbnail'),
                ).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: category }));
        }
    });

    it('adds multiple records without closing, and chip removal updates the open picker', async () => {
        const user = userEvent.setup();
        render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        const picker = screen.getByRole('dialog', { name: 'Veggies' });
        for (const name of ['Spinach', 'Tomato']) {
            const option = within(picker).getByRole('button', { name });
            await user.click(option);
            expect(option).toHaveAttribute('aria-pressed', 'true');
            expect(option).toHaveFocus();
            expect(
                screen.getByRole('button', { name: `Remove ${name}` }),
            ).toBeInTheDocument();
        }
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        const remove = screen.getByRole('button', { name: 'Remove Spinach' });
        await user.click(remove);
        // React uses the WebKit event in jsdom, which lacks AnimationEvent.
        const event = new Event(
            'AnimationEvent' in window ? 'animationend' : 'webkitAnimationEnd',
            { bubbles: true },
        );
        Object.defineProperty(event, 'animationName', {
            value: 'ingredient-chip-delete-out',
        });
        fireEvent(remove.closest('.ingredient-chip-wrapper')!, event);
        expect(
            screen.queryByRole('button', { name: 'Remove Spinach' }),
        ).not.toBeInTheDocument();
        // A chip is outside the desktop popover, so that click also dismisses
        // it. Reopening must reflect the current shared selection.
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        expect(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        ).toHaveAttribute('aria-pressed', 'false');
    });

    it('shares case/trim identity and can remove a differently cased selected name', async () => {
        const user = userEvent.setup();
        render(
            <Form
                initial={[' SPINACH ']}
                saved={[
                    ...records,
                    {
                        ...records[0],
                        ingredientId: 'duplicate',
                        name: ' spinach ',
                    },
                ]}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        const picker = screen.getByRole('dialog');
        expect(
            within(picker).getAllByRole('button', { name: 'Spinach' }),
        ).toHaveLength(1);
        const option = within(picker).getByRole('button', { name: 'Spinach' });
        expect(option).toHaveAttribute('aria-pressed', 'true');
        await user.click(option);
        expect(option).toHaveAttribute('aria-pressed', 'false');
        await user.click(option);
        expect(
            screen.getAllByRole('button', { name: 'Remove Spinach' }),
        ).toHaveLength(1);
    });

    it('switches categories with selections preserved and only one picker open', async () => {
        const user = userEvent.setup();
        render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Protein' }));
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Firm tofu',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        expect(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: 'Remove Firm tofu' }),
        ).toBeInTheDocument();
    });

    it.each(['Escape', 'close', 'category', 'outside'])(
        'dismisses desktop with %s and restores focus',
        async (method) => {
            const user = userEvent.setup();
            render(<Form />);
            const trigger = screen.getByRole('button', { name: 'Grains' });
            await user.click(trigger);
            expect(screen.getByRole('dialog')).toHaveFocus();
            if (method === 'Escape') await user.keyboard('{Escape}');
            if (method === 'close')
                await user.click(
                    screen.getByRole('button', {
                        name: 'Close ingredient picker',
                    }),
                );
            if (method === 'category') await user.click(trigger);
            if (method === 'outside')
                fireEvent.pointerDown(
                    screen.getByRole('button', { name: 'Outside control' }),
                );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(trigger).toHaveFocus();
            expect(trigger).toHaveAttribute('aria-expanded', 'false');
        },
    );

    it.each(['Escape', 'backdrop', 'handle'])(
        'dismisses the mobile sheet with %s and restores focus after sliding out',
        async (method) => {
            setMobile(true);
            const user = userEvent.setup();
            render(<Form />);
            const originalOverflow = document.body.style.overflow;
            const trigger = screen.getByRole('button', {
                name: 'Nuts & Seeds',
            });
            await user.click(trigger);
            const picker = screen.getByRole('dialog');
            expect(picker).toHaveClass('sliding-sheet', 'quick-add-sheet');
            expect(picker).toHaveAttribute('aria-modal', 'true');
            expect(trigger).toHaveAttribute('aria-controls', picker.id);
            expect(document.body.style.overflow).toBe('hidden');
            expect(
                within(picker).queryByRole('button', {
                    name: 'Close ingredient picker',
                }),
            ).not.toBeInTheDocument();
            if (method === 'Escape')
                fireEvent(picker, new Event('cancel', { cancelable: true }));
            if (method === 'backdrop')
                fireEvent.click(picker, { clientX: -10, clientY: -10 });
            if (method === 'handle')
                await user.click(
                    within(picker).getByRole('button', { name: 'Close sheet' }),
                );
            expect(picker).toHaveAttribute('data-phase', 'closing');
            expect(document.body.style.overflow).toBe('hidden');
            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
                expect(document.body.style.overflow).toBe(originalOverflow);
                expect(trigger).toHaveFocus();
            });
        },
    );

    it('keeps mobile selections while resizing between a sheet and desktop popover', async () => {
        setMobile(true);
        const user = userEvent.setup();
        render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        const picker = screen.getByRole('dialog');
        await user.tab();
        expect(
            within(picker).getByRole('button', { name: 'Close sheet' }),
        ).toHaveFocus();
        for (const name of ['Spinach', 'Tomato']) {
            const option = within(picker).getByRole('button', { name });
            await user.click(option);
            expect(option).toHaveAttribute('aria-pressed', 'true');
            expect(option).toHaveFocus();
            expect(picker).toHaveAttribute('data-phase', 'idle');
        }
        act(() => setMobile(false));
        const popover = screen.getByRole('dialog');
        expect(popover).toHaveClass('quick-add-picker');
        expect(popover).not.toHaveAttribute('aria-modal');
        expect(popover).toHaveFocus();
        expect(document.body.style.overflow).not.toBe('hidden');
        expect(
            within(popover).getByRole('button', { name: 'Spinach' }),
        ).toHaveAttribute('aria-pressed', 'true');
        act(() => setMobile(true));
        expect(screen.getByRole('dialog')).toHaveClass('quick-add-sheet');
        expect(screen.getByRole('dialog')).toHaveFocus();
        expect(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Tomato',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.queryByRole('button', { name: 'Done' }),
        ).not.toBeInTheDocument();
    });

    it('keeps a useful empty state for Saved without fetching', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.click(screen.getByRole('button', { name: 'Saved' }));
        expect(
            within(screen.getByRole('dialog')).getByText(
                /No saved ingredients/,
            ),
        ).toBeInTheDocument();
        expect(
            within(screen.getByRole('dialog')).getAllByRole('button'),
        ).toHaveLength(1);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('preserves saved search, duplicate prevention, manual entry and nutrition editing', async () => {
        const user = userEvent.setup();
        const edit = vi.fn();
        render(<Form onEdit={edit} />);
        const search = screen.getByRole('combobox');
        await user.type(search, 'spinach{Enter}');
        await user.type(search, ' SPINACH {Enter}');
        expect(
            screen.getAllByRole('button', { name: 'Remove Spinach' }),
        ).toHaveLength(1);
        await user.type(search, 'Paprika{Enter}');
        expect(
            screen.getByRole('button', { name: 'Remove Paprika' }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Edit nutrition for Spinach' }),
        );
        expect(edit).toHaveBeenCalledWith(0);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        expect(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
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
