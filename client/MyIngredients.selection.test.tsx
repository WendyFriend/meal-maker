import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyIngredients from './MyIngredients';
import type { UserIngredient } from '../shared/types/types';

const records: UserIngredient[] = ['Broccoli', 'Tofu', 'Brown rice'].map(
    (name, index) => ({
        name,
        ingredientId: String(index),
        caloriesPer100g: 100,
        proteinPer100g: 10,
        carbohydratePer100g: 5,
        fatPer100g: 3,
    }),
);

function setup(deleteMany = vi.fn(async (ids: string[]) => ids)) {
    const onOpen = vi.fn();
    function Fixture() {
        const [ingredients, setIngredients] = useState(records);
        return (
            <MyIngredients
                ingredients={ingredients}
                onAdd={vi.fn()}
                onOpen={onOpen}
                onDeleteMany={async (ids) => {
                    const deleted = await deleteMany(ids);
                    setIngredients((current) =>
                        current.filter(
                            ({ ingredientId }) =>
                                !deleted.includes(ingredientId),
                        ),
                    );
                    return deleted;
                }}
            />
        );
    }
    render(<Fixture />);
    return { deleteMany, onOpen };
}

function hold(row: HTMLElement) {
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(row);
    fireEvent.click(row);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('My Ingredients bulk selection', () => {
    it('selects on long press, suppresses the release click, and deletes selected rows together', async () => {
        const { deleteMany, onOpen } = setup();
        hold(screen.getByRole('button', { name: /Broccoli/ }));
        expect(
            screen.getByRole('button', { name: 'Deselect Broccoli' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(onOpen).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Select Tofu' }));
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Delete 2 ingredients' }),
            );
        });
        expect(deleteMany).toHaveBeenCalledExactlyOnceWith(['0', '1']);
        expect(
            screen.queryByRole('button', { name: /Broccoli/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Brown rice/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add ingredient' }),
        ).toBeInTheDocument();
    });

    it('does not enter selection or open details when a press moves into a scroll gesture', () => {
        const { onOpen } = setup();
        const row = screen.getByRole('button', { name: /Broccoli/ });
        fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerMove(row, { clientX: 10, clientY: 35 });
        act(() => vi.advanceTimersByTime(600));
        fireEvent.pointerUp(row);
        fireEvent.click(row);
        expect(
            screen.queryByRole('button', { name: 'Cancel selection' }),
        ).not.toBeInTheDocument();
        expect(onOpen).not.toHaveBeenCalled();
        fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
        fireEvent.pointerUp(row);
        fireEvent.click(row);
        expect(onOpen).toHaveBeenCalledExactlyOnceWith(records[0]);
    });

    it('selects only matching search results and leaves other ingredients untouched', async () => {
        const { deleteMany } = setup();
        fireEvent.click(
            screen.getByRole('button', { name: 'Select ingredients' }),
        );
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'Bro' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Select results' }));
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Delete 2 ingredients' }),
            );
        });
        expect(deleteMany).toHaveBeenCalledExactlyOnceWith(['0', '2']);
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: '' },
        });
        expect(
            screen.getByRole('button', { name: /Tofu/ }),
        ).toBeInTheDocument();
    });

    it('retains the selection after a failure so the same deletion can be retried', async () => {
        const deleteMany = vi
            .fn(async (ids: string[]) => ids)
            .mockRejectedValueOnce(new Error('Offline'));
        setup(deleteMany);
        fireEvent.click(
            screen.getByRole('button', { name: 'Select ingredients' }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Select Broccoli' }),
        );
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Delete 1 ingredient' }),
            );
        });
        expect(screen.getByRole('alert')).toHaveTextContent('Could not delete');
        expect(
            screen.getByRole('button', { name: 'Deselect Broccoli' }),
        ).toHaveAttribute('aria-pressed', 'true');
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Delete 1 ingredient' }),
            );
        });
        expect(deleteMany).toHaveBeenNthCalledWith(2, ['0']);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Broccoli/ }),
        ).not.toBeInTheDocument();
    });
});
