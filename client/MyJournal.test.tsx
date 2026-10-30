import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyJournal from './MyJournal';
import { getJournalEntries } from './services/journalService';
import type { JournalEntry } from '../shared/types/journal';
import { MICRONUTRIENTS } from '../shared/micronutrients';
vi.mock('./services/journalService', () => ({ getJournalEntries: vi.fn() }));
vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));
const micros = Object.fromEntries(MICRONUTRIENTS.map(({ key }) => [key, 1]));
const entry: JournalEntry = {
    id: '1',
    eatenAt: '2026-10-29T10:30:00+11:00',
    mealName: 'Fruit snack',
    ingredients: [
        {
            name: 'Apple',
            weight: 100,
            caloriesPer100g: 52,
            proteinPer100g: 0.3,
            carbohydratePer100g: 14,
            fatPer100g: 0.2,
            ...micros,
        },
        {
            name: 'Orange',
            weight: 200,
            caloriesPer100g: 47,
            proteinPer100g: 0.9,
            carbohydratePer100g: 12,
            fatPer100g: 0.1,
            ...micros,
        },
    ],
};
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJournalEntries).mockResolvedValue([entry]);
});
describe('My Day', () => {
    it('shows daily totals, micronutrients, foods, portions and time with per-meal totals', async () => {
        render(<MyJournal />);
        expect(await screen.findByText('Fruit snack')).toBeInTheDocument();
        expect(
            screen.getByText('146', { selector: '.journal-calories strong' }),
        ).toBeInTheDocument();
        expect(screen.getByText('100 g')).toBeInTheDocument();
        expect(screen.getByText('200 g')).toBeInTheDocument();
        expect(document.querySelector('time')).toHaveAttribute(
            'datetime',
            entry.eatenAt,
        );
        expect(
            document.querySelector('.journal-entry-total'),
        ).toHaveTextContent(
            '146 kcal · 2.1 g protein · 38 g carbs · 0.4 g fat',
        );
        const daily = screen.getByRole('region', {
            name: 'Daily vitamins and minerals',
        });
        expect(
            within(daily).getByRole('button', { name: 'Iron' }).closest('li'),
        ).toHaveTextContent('3 mg');
        expect(within(daily).getByText('This day · % DV')).toBeInTheDocument();
    });
    it('loads the selected day, displays an empty day honestly, and retries failed requests', async () => {
        vi.mocked(getJournalEntries).mockRejectedValueOnce(
            new Error('offline'),
        );
        render(<MyJournal />);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not load',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await screen.findByText('Fruit snack');
        vi.mocked(getJournalEntries).mockResolvedValue([]);
        fireEvent.change(screen.getByLabelText('Journal date'), {
            target: { value: '2026-10-28' },
        });
        await waitFor(() =>
            expect(getJournalEntries).toHaveBeenLastCalledWith('2026-10-28'),
        );
        expect(
            await screen.findByText('No food logged for this day'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('0', { selector: '.journal-calories strong' }),
        ).toBeInTheDocument();
    });
});
