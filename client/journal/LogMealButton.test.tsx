import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LogMealButton from './LogMealButton';
import MealResult from '../meal-generator/components/MealResult';
import {
    deleteJournalEntry,
    saveJournalEntry,
} from '../services/journalService';
import { mockPickerEnvironment } from '../test/pickerEnvironment';
import type { GenerateMealResponse } from '../../shared/types/types';
vi.mock('../services/journalService', () => ({
    saveJournalEntry: vi.fn(),
    deleteJournalEntry: vi.fn(),
}));
vi.mock('../hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));
const meal: GenerateMealResponse = {
    mealName: 'Tofu bowl',
    instructions: [],
    ingredients: [
        {
            name: 'Tofu',
            weight: 125,
            caloriesPer100g: 130,
            proteinPer100g: 15,
            carbohydratePer100g: 6,
            fatPer100g: 4,
        },
    ],
};
beforeEach(() => {
    vi.clearAllMocks();
    mockPickerEnvironment();
    vi.mocked(saveJournalEntry).mockImplementation(async (entry) => ({
        id: 'entry-1',
        ...entry,
    }));
    vi.mocked(deleteJournalEntry).mockResolvedValue(undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('My Day toggle', () => {
    it('stacks the My Day action after the bookmark in the header', () => {
        render(<MealResult meal={meal} onChange={vi.fn()} />);
        const bookmark = screen.getByRole('button', { name: 'Save this meal' });
        const add = screen.getByRole('button', { name: 'Add to My Day' });
        expect(add.closest('.meal-result-actions')).toBe(
            bookmark.closest('.meal-result-actions'),
        );
        expect(
            bookmark.compareDocumentPosition(add) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
    it('adds and removes the exact entry, showing the shared centered confirmation for both', async () => {
        const outerSave = vi.fn((event) => event.preventDefault());
        const user = userEvent.setup();
        render(
            <form onSubmit={outerSave}>
                <LogMealButton meal={meal} />
            </form>,
        );
        await user.click(screen.getByRole('button', { name: 'Add to My Day' }));
        expect(
            await screen.findByRole('dialog', { name: 'Added to My Day' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Added to My Day');
        expect(saveJournalEntry).toHaveBeenCalledOnce();
        expect(vi.mocked(saveJournalEntry).mock.calls[0][0]).toMatchObject({
            mealName: meal.mealName,
            ingredients: meal.ingredients,
        });
        await user.click(screen.getByRole('dialog'));
        const remove = screen.getByRole('button', {
            name: 'Remove from My Day',
        });
        expect(remove).toHaveAttribute('aria-pressed', 'true');
        await user.click(remove);
        expect(deleteJournalEntry).toHaveBeenCalledExactlyOnceWith('entry-1');
        expect(
            await screen.findByRole('dialog', { name: 'Removed from My Day' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Removed from My Day',
        );
        expect(outerSave).not.toHaveBeenCalled();
        await user.click(screen.getByRole('dialog'));
        expect(
            screen.getByRole('button', { name: 'Add to My Day' }),
        ).toHaveAttribute('aria-pressed', 'false');
    });
    it('dismisses the confirmation automatically without forgetting the journal entry', async () => {
        vi.useFakeTimers();
        render(<LogMealButton meal={meal} />);
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Add to My Day' }),
            );
        });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1800));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Remove from My Day' }),
        ).toBeEnabled();
    });
    it('prevents duplicate requests and keeps the correct state after failed additions or removals', async () => {
        let reject!: (error: Error) => void;
        vi.mocked(saveJournalEntry).mockImplementationOnce(
            () =>
                new Promise((_resolve, fail) => {
                    reject = fail;
                }),
        );
        const user = userEvent.setup();
        render(<LogMealButton meal={meal} />);
        const add = screen.getByRole('button', { name: 'Add to My Day' });
        fireEvent.click(add);
        fireEvent.click(add);
        expect(saveJournalEntry).toHaveBeenCalledOnce();
        expect(add).toBeDisabled();
        await act(async () => reject(new Error('offline')));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not add',
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await user.click(add);
        await screen.findByRole('dialog');
        await user.click(screen.getByRole('dialog'));
        vi.mocked(deleteJournalEntry).mockRejectedValueOnce(
            new Error('offline'),
        );
        await user.click(
            screen.getByRole('button', { name: 'Remove from My Day' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not remove',
        );
        expect(
            screen.getByRole('button', { name: 'Remove from My Day' }),
        ).toBeEnabled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('disables both add and remove actions when the meal is being edited', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<LogMealButton meal={meal} disabled />);
        const add = screen.getByRole('button', { name: 'Add to My Day' });
        await user.click(add);
        expect(saveJournalEntry).not.toHaveBeenCalled();
        rerender(<LogMealButton meal={meal} />);
        await user.click(screen.getByRole('button', { name: 'Add to My Day' }));
        await user.click(
            await screen.findByRole('dialog', { name: 'Added to My Day' }),
        );
        rerender(<LogMealButton meal={meal} disabled />);
        expect(
            screen.getByRole('button', { name: 'Remove from My Day' }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Remove from My Day' }),
        );
        expect(deleteJournalEntry).not.toHaveBeenCalled();
    });
});
