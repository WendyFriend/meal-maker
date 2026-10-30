import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserIngredient } from '../../../shared/types/types';
import IngredientInput from './IngredientInput';
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
                onIngredientClick={onEdit}
            />
            <button type="button">Outside control</button>
        </>
    );
}

let setMobile: (mobile: boolean) => void;
beforeEach(() => {
    setMobile = mockPickerEnvironment();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('ingredient Quick add integration', () => {
    it('adds multiple records without closing, and chip removal updates the open picker', async () => {
        const user = userEvent.setup();
        render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        const picker = screen.getByRole('dialog', { name: 'Veggies' });
        for (const name of ['Spinach', 'Broccoli']) {
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
                name: 'Tofu',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        expect(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: 'Remove Tofu' }),
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

    it.each(['close', 'Escape', 'outside'])(
        'dismisses the mobile popover with %s without locking the page',
        async (method) => {
            setMobile(true);
            const user = userEvent.setup();
            const { container } = render(<Form />);
            const originalOverflow = document.body.style.overflow;
            const trigger = screen.getByRole('button', {
                name: 'Nuts & Seeds',
            });
            await user.click(trigger);
            const picker = screen.getByRole('dialog');
            expect(picker).not.toHaveAttribute('aria-modal');
            expect(container).not.toHaveAttribute('inert');
            expect(document.body.style.overflow).toBe(originalOverflow);
            if (method === 'close')
                await user.click(
                    within(picker).getByRole('button', {
                        name: 'Close ingredient picker',
                    }),
                );
            if (method === 'Escape') await user.keyboard('{Escape}');
            if (method === 'outside')
                fireEvent.pointerDown(
                    screen.getByRole('button', { name: 'Outside control' }),
                );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(container).not.toHaveAttribute('inert');
            expect(document.body.style.overflow).toBe(originalOverflow);
            expect(trigger).toHaveFocus();
        },
    );

    it('supports mobile keyboard selection and preserves the popover across breakpoint changes', async () => {
        setMobile(true);
        const user = userEvent.setup();
        const { container } = render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
        const picker = screen.getByRole('dialog');
        await user.tab();
        expect(
            within(picker).getByRole('button', {
                name: 'Close ingredient picker',
            }),
        ).toHaveFocus();
        const spinach = within(picker).getByRole('button', { name: 'Spinach' });
        await user.click(spinach);
        expect(spinach).toHaveFocus();
        act(() => setMobile(false));
        expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
        expect(container).not.toHaveAttribute('inert');
        expect(
            screen.queryByRole('button', { name: 'Done' }),
        ).not.toBeInTheDocument();
        expect(spinach).toHaveAttribute('aria-pressed', 'true');
    });

    it('uses only existing records, including a useful empty state, without fetching', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.click(screen.getByRole('button', { name: 'Veggies' }));
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

describe('saved record category mapping', () => {
    it('classifies familiar variants, deduplicates names, preserves records and excludes uncategorised pantry records', () => {
        const groups = groupQuickAddIngredients([
            ...records,
            { ...records[0], ingredientId: 'duplicate', name: ' SPINACH ' },
        ]);
        expect(groups.vegetables).toEqual([records[0], records[1]]);
        expect(groups.proteins).toEqual([records[2]]);
        expect(groups.grains).toEqual([records[3]]);
        expect(groups['nuts-seeds']).toEqual([]);
        expect(groups.vegetables[0]).toBe(records[0]);
    });
});

describe('Nutrition Lab search and splitting', () => {
    function reply(body: unknown, ok = true) {
        return Promise.resolve({ ok, json: () => Promise.resolve(body) });
    }

    it('suggests database foods and adds the short name as a chip', async () => {
        const fetch = vi.fn(() =>
            reply({
                results: [
                    {
                        fdcId: 171474,
                        name: 'Chicken, breast',
                        description:
                            'Chicken, broilers or fryers, breast, meat and skin, raw',
                        caloriesPer100g: 172,
                    },
                ],
            }),
        );
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form />);
        await user.type(screen.getByRole('combobox'), 'chick');
        const option = await screen.findByRole('option', {
            name: /Chicken, breast/,
        });
        expect(fetch).toHaveBeenCalledWith(
            '/api/food-suggestions?q=chick',
            expect.anything(),
        );
        expect(option).toHaveTextContent('172 kcal/100g');
        fireEvent.pointerDown(option);
        expect(
            screen.getByRole('button', { name: 'Remove Chicken, breast' }),
        ).toBeInTheDocument();
    });

    it('splits several typed foods into separate chips', async () => {
        const fetch = vi.fn((url: string) =>
            url === '/api/parse-ingredients'
                ? reply({
                      ingredients: ['chicken breast', 'brown rice', 'broccoli'],
                  })
                : reply({ results: [] }),
        );
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.type(
            screen.getByRole('combobox'),
            'chicken breast, brown rice and brocoli{Enter}',
        );
        for (const name of ['chicken breast', 'brown rice', 'broccoli']) {
            expect(
                await screen.findByRole('button', { name: `Remove ${name}` }),
            ).toBeInTheDocument();
        }
        expect(fetch).not.toHaveBeenCalledWith(
            expect.stringContaining('/api/food-suggestions'),
            expect.anything(),
        );
    });

    it('adds a single typed word under its database name', async () => {
        const fetch = vi.fn((url: string) =>
            url === '/api/parse-ingredients'
                ? reply({ ingredients: ['Tomatoes, red, ripe'] })
                : reply({ results: [] }),
        );
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.type(screen.getByRole('combobox'), 'tomato{Enter}');
        expect(
            await screen.findByRole('button', {
                name: 'Remove Tomatoes, red, ripe',
            }),
        ).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith(
            '/api/parse-ingredients',
            expect.objectContaining({
                body: JSON.stringify({ text: 'tomato' }),
            }),
        );
    });

    it('asks the parser to split foods typed with only spaces', async () => {
        const fetch = vi.fn((url: string) =>
            url === '/api/parse-ingredients'
                ? reply({ ingredients: ['tomato', 'potato'] })
                : reply({ results: [] }),
        );
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.type(screen.getByRole('combobox'), 'Tomato potato{Enter}');
        expect(
            await screen.findByRole('button', { name: 'Remove tomato' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Remove potato' }),
        ).toBeInTheDocument();
    });

    it('splits on separators when the parser is unavailable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => reply({}, false)),
        );
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.type(screen.getByRole('combobox'), 'eggs & toast{Enter}');
        expect(
            await screen.findByRole('button', { name: 'Remove eggs' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Remove toast' }),
        ).toBeInTheDocument();
    });
});
