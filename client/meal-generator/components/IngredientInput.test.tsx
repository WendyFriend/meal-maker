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
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
        const picker = screen.getByRole('dialog', { name: 'Vegetables' });
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
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
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
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
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
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Proteins' }));
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Tofu',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
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

    it.each(['close', 'Escape', 'backdrop'])(
        'dismisses mobile with %s and restores inertness, scrolling and focus',
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
            expect(picker).toHaveAttribute('aria-modal', 'true');
            expect(container).toHaveAttribute('inert');
            expect(document.body.style.overflow).toBe('hidden');
            if (method === 'close')
                await user.click(
                    within(picker).getByRole('button', {
                        name: 'Close ingredient picker',
                    }),
                );
            if (method === 'Escape') await user.keyboard('{Escape}');
            if (method === 'backdrop')
                fireEvent.click(picker, { clientX: -1, clientY: -1 });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(container).not.toHaveAttribute('inert');
            expect(document.body.style.overflow).toBe(originalOverflow);
            expect(trigger).toHaveFocus();
        },
    );

    it('traps mobile Tab/Shift+Tab, keeps focus inside after selections and cleans up on breakpoint change', async () => {
        setMobile(true);
        const user = userEvent.setup();
        const { container } = render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
        const picker = screen.getByRole('dialog');
        await user.tab();
        expect(
            within(picker).getByRole('button', {
                name: 'Close ingredient picker',
            }),
        ).toHaveFocus();
        await user.tab({ shift: true });
        // Shift+Tab wraps to the last option, which is now a starter.
        const options = within(picker).getAllByRole('button');
        expect(options[options.length - 1]).toHaveFocus();
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

    it('offers starter names (and no nutrition) to new users without fetching', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup();
        render(<Form saved={[]} />);
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
        const picker = screen.getByRole('dialog');
        expect(within(picker).queryByText(/No saved ingredients/)).toBeNull();
        // Close button plus 8-12 starters.
        expect(
            within(picker).getAllByRole('button').length,
        ).toBeGreaterThanOrEqual(1 + 8);
        await user.click(
            within(picker).getByRole('button', { name: 'Broccoli' }),
        );
        expect(
            screen.getByRole('button', { name: 'Remove Broccoli' }),
        ).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('lists saved ingredients first with a marker, then starters without duplicates', async () => {
        const user = userEvent.setup();
        render(<Form />);
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
        const picker = screen.getByRole('dialog');
        const names = within(picker)
            .getAllByRole('button')
            .slice(1)
            .map((button) => button.textContent);
        expect(names.slice(0, 2)).toEqual(['Spinachsaved', 'Broccolisaved']);
        expect(
            names.filter((name) => /^spinach/i.test(name ?? '')),
        ).toHaveLength(1);
        expect(names.length).toBeGreaterThan(2);
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
        await user.click(screen.getByRole('button', { name: 'Vegetables' }));
        expect(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Spinach',
            }),
        ).toHaveAttribute('aria-pressed', 'true');
    });
});

describe('USDA suggestions in ingredient search', () => {
    const usda = (name: string) => ({
        source: 'usda',
        description: name.toUpperCase(),
        name,
        caloriesPer100g: 120,
        proteinPer100g: 5,
        carbohydratePer100g: 20,
        fatPer100g: 2,
    });

    function stubUsda(names: string[]) {
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ results: names.map(usda) }),
        });
        vi.stubGlobal('fetch', fetch);
        return fetch;
    }

    it('shows a debounced From USDA group after saved matches and adds by name', async () => {
        const fetch = stubUsda(['Spinach', 'Spinach, frozen']);
        const user = userEvent.setup();
        render(<Form />);
        await user.type(screen.getByRole('combobox'), 'spin');
        // One debounced request for the settled query, not one per key.
        const option = await screen.findByRole('option', {
            name: /Spinach, frozen/,
        });
        expect(screen.getByText('From USDA')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toBe('/api/nutrition?q=spin');
        // The saved "Spinach" is not repeated under USDA.
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
            ['Spinach', 'Spinach, frozen120 kcal', '+ spin↵'],
        );
        fireEvent.pointerDown(option);
        expect(
            screen.getByRole('button', { name: 'Remove Spinach, frozen' }),
        ).toBeInTheDocument();
    });

    it('does not look up fewer than 2 characters', async () => {
        const fetch = stubUsda(['Tomato']);
        const user = userEvent.setup();
        render(<Form />);
        await user.type(screen.getByRole('combobox'), 't');
        await new Promise((resolve) => setTimeout(resolve, 450));
        expect(fetch).not.toHaveBeenCalled();
    });

    it('keyboard navigates across saved, USDA and custom rows', async () => {
        stubUsda(['Spinach, frozen']);
        const user = userEvent.setup();
        render(<Form />);
        await user.type(screen.getByRole('combobox'), 'spin');
        await screen.findByRole('option', { name: /Spinach, frozen/ });
        await user.keyboard('{ArrowDown}{ArrowDown}');
        expect(
            screen.getByRole('option', { name: /Spinach, frozen/ }),
        ).toHaveAttribute('aria-selected', 'true');
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('option', { name: /\+ spin/ })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await user.keyboard('{ArrowUp}{Enter}');
        expect(
            screen.getByRole('button', { name: 'Remove Spinach, frozen' }),
        ).toBeInTheDocument();
    });

    it('degrades to saved suggestions when the lookup fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 502 })),
        );
        const user = userEvent.setup();
        render(<Form />);
        await user.type(screen.getByRole('combobox'), 'spin');
        await new Promise((resolve) => setTimeout(resolve, 450));
        expect(screen.queryByText('From USDA')).toBeNull();
        expect(
            screen.getByRole('option', { name: /Spinach/ }),
        ).toBeInTheDocument();
        await user.keyboard('{Enter}');
        expect(
            screen.getByRole('button', { name: 'Remove Spinach' }),
        ).toBeInTheDocument();
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
