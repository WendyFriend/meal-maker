import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyJournal from './MyJournal';
import { mockPickerEnvironment } from './test/pickerEnvironment';
import { localDateValue } from './journal/nutrition';
import { notifyJournalChanged } from './journal/changes';
import {
    getJournalEntries,
    reorderJournalEntries,
    updateJournalEntryIngredients,
} from './services/journalService';
import type { JournalEntry } from '../shared/types/journal';
import { MICRONUTRIENTS } from '../shared/micronutrients';
vi.mock('./services/journalService', () => ({
    getJournalEntries: vi.fn(),
    reorderJournalEntries: vi.fn(),
    updateJournalEntryIngredients: vi.fn(),
}));
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
    mockPickerEnvironment();
    vi.clearAllMocks();
    vi.mocked(getJournalEntries).mockResolvedValue([entry]);
    vi.mocked(reorderJournalEntries).mockResolvedValue(undefined);
    vi.mocked(updateJournalEntryIngredients).mockImplementation(
        async (_id, ingredients) => ({ ...entry, ingredients }),
    );
});
afterEach(() => vi.unstubAllGlobals());
describe('My Plan', () => {
    it('keeps nutrition unavailable when no ingredient has usable data', async () => {
        vi.mocked(getJournalEntries).mockResolvedValueOnce([
            {
                ...entry,
                ingredients: [
                    {
                        name: 'Unknown food',
                        weight: 100,
                        caloriesPer100g: 0,
                        proteinPer100g: 0,
                        carbohydratePer100g: 0,
                        fatPer100g: 0,
                        nutritionUnavailable: true,
                    },
                ],
            },
        ]);
        render(<MyJournal />);
        expect(
            await screen.findByRole('group', {
                name: 'Daily nutrition summary',
            }),
        ).toHaveTextContent('Nutrition unavailable for some ingredients.');
        fireEvent.click(
            screen.getByRole('button', { name: 'Meal 1, Fruit snack' }),
        );
        expect(
            within(document.getElementById('journal-meal-1')!).getByText(
                'Nutrition unavailable for some ingredients.',
            ),
        ).toBeInTheDocument();
    });

    it('identifies an ingredient with unavailable nutrition beside its name', async () => {
        vi.mocked(getJournalEntries).mockResolvedValueOnce([
            {
                ...entry,
                ingredients: [
                    ...entry.ingredients,
                    {
                        name: 'Unknown food',
                        weight: 100,
                        caloriesPer100g: 0,
                        proteinPer100g: 0,
                        carbohydratePer100g: 0,
                        fatPer100g: 0,
                        nutritionUnavailable: true,
                    },
                ],
            },
        ]);
        render(<MyJournal />);

        expect(
            within(
                await screen.findByRole('group', {
                    name: 'Daily nutrition summary',
                }),
            ).getByText('146').parentElement,
        ).toHaveTextContent('146kcal');
        expect(
            screen.getByRole('group', { name: 'Daily nutrition summary' }),
        ).toHaveClass('journal-day-summary-overview');
        fireEvent.click(
            screen.getByRole('button', { name: 'Meal 1, Fruit snack' }),
        );
        const meal = document.getElementById('journal-meal-1')!;
        expect(meal).toHaveTextContent(
            'Based on ingredients with available nutrition data',
        );
        expect(
            within(meal).getByRole('group', {
                name: 'Calories and nutrient amounts',
            }),
        ).toHaveTextContent('146kcal');
        const warning = within(meal).getByRole('button', {
            name: 'Nutrition unavailable for Unknown food',
        });
        const popover = document.getElementById(
            warning.getAttribute('popovertarget')!,
        );
        expect(popover).toHaveTextContent('Nutrition unavailable');
        expect(
            warning
                .closest('.ingredient-section-row')
                ?.querySelector('.ingredient-calorie-value'),
        ).toHaveTextContent('—');
        const chevron = within(meal).getByRole('button', {
            name: 'Open Unknown food nutrition',
        });
        expect(
            warning.compareDocumentPosition(chevron) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        fireEvent.click(chevron);
        expect(
            await screen.findByRole('dialog', {
                name: 'Ingredient nutrition',
            }),
        ).toBeInTheDocument();
        expect(
            within(meal).queryByRole('button', {
                name: 'Nutrition unavailable for Apple',
            }),
        ).not.toBeInTheDocument();
    });

    it('opens ingredient nutrition from a planned meal row', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Apple' }));

        expect(
            await screen.findByRole('dialog', {
                name: 'Ingredient nutrition',
            }),
        ).toBeInTheDocument();
    });

    it('edits meal ingredient weights with live nutrition and saves the snapshot', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        expect(
            screen.getByRole('meter', {
                name: 'Apple calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '52 kcal');
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        expect(
            within(
                screen.getByRole('region', { name: 'Ingredients' }),
            ).queryByRole('heading', { name: 'Ingredients' }),
        ).not.toBeInTheDocument();
        const weight = screen.getByRole('spinbutton', {
            name: 'Apple weight in grams',
        });
        fireEvent.change(weight, { target: { value: '200' } });
        expect(
            screen.getByRole('meter', {
                name: 'Apple calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '104 kcal');
        expect(
            within(document.getElementById('journal-meal-1')!).getByRole(
                'group',
                { name: 'Calories and nutrient amounts' },
            ),
        ).toHaveTextContent('198');
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Apple', weight: 200 }),
                ]),
            ),
        );
        expect(
            within(document.getElementById('journal-meal-1')!)
                .getByText('Apple')
                .closest('li'),
        ).toHaveTextContent('200 g');
        expect(
            await screen.findByText('Ingredients updated'),
        ).toBeInTheDocument();
    });

    it('restores the ingredient editor if a meal update fails', async () => {
        vi.mocked(updateJournalEntryIngredients).mockRejectedValueOnce(
            new Error('Offline'),
        );
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        fireEvent.change(
            screen.getByRole('spinbutton', {
                name: 'Apple weight in grams',
            }),
            { target: { value: '200' } },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );

        expect(
            await screen.findByRole('button', {
                name: 'Save ingredients changes',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('spinbutton', { name: 'Apple weight in grams' }),
        ).toHaveValue(200);
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Could not save ingredients',
        );
        expect(
            screen.queryByText('Ingredients updated'),
        ).not.toBeInTheDocument();
    });

    it('cancels meal ingredient edits without saving', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        fireEvent.change(
            screen.getByRole('spinbutton', {
                name: 'Apple weight in grams',
            }),
            { target: { value: '200' } },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Cancel ingredients changes' }),
        );
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
        expect(
            within(document.getElementById('journal-meal-1')!)
                .getByText('Apple')
                .closest('li'),
        ).toHaveTextContent('100 g');
    });

    it('adds and removes ingredients before saving a meal', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        fireEvent.keyDown(
            screen.getByLabelText(/Orange, swipe left or press Left Arrow/),
            { key: 'Delete' },
        );
        await waitFor(() =>
            expect(
                within(document.getElementById('journal-meal-1')!).queryByText(
                    'Orange',
                ),
            ).not.toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 2' });
        fireEvent.change(input, { target: { value: 'Kiwi' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Kiwi', weight: 100 }),
                ]),
            ),
        );
        expect(
            vi.mocked(updateJournalEntryIngredients).mock.calls.at(-1)?.[1],
        ).toHaveLength(2);
    });

    it('keeps multiple meals expanded until each one is closed', async () => {
        vi.mocked(getJournalEntries).mockResolvedValue([
            entry,
            { ...entry, id: '2', mealName: 'Tofu bowl' },
        ]);
        render(<MyJournal />);
        const first = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        const second = screen.getByRole('button', {
            name: 'Meal 2, Tofu bowl',
        });

        fireEvent.click(first);
        fireEvent.click(second);
        expect(first).toHaveAttribute('aria-expanded', 'true');
        expect(second).toHaveAttribute('aria-expanded', 'true');
        expect(document.getElementById('journal-meal-1')).toHaveAttribute(
            'data-open',
            'true',
        );
        expect(document.getElementById('journal-meal-2')).toHaveAttribute(
            'data-open',
            'true',
        );

        fireEvent.click(first);
        expect(first).toHaveAttribute('aria-expanded', 'false');
        expect(second).toHaveAttribute('aria-expanded', 'true');
    });

    it('refreshes once after a meal changes while the page is hidden', async () => {
        const view = render(<MyJournal isActive />);
        await screen.findByRole('button', { name: 'Meal 1, Fruit snack' });
        expect(getJournalEntries).toHaveBeenCalledOnce();

        view.rerender(<MyJournal isActive={false} />);
        expect(
            screen.queryByRole('heading', { name: 'My Plan' }),
        ).not.toBeInTheDocument();
        act(() => notifyJournalChanged());
        expect(getJournalEntries).toHaveBeenCalledOnce();

        view.rerender(<MyJournal isActive />);
        expect(
            screen.getByRole('button', { name: 'Meal 1, Fruit snack' }),
        ).toBeInTheDocument();
        await waitFor(() => expect(getJournalEntries).toHaveBeenCalledTimes(2));
    });
    it('moves between days from the single date row', () => {
        render(<MyJournal />);
        const date = screen.getByRole('button', { name: 'Choose plan date' });
        const initial = date.textContent;
        fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
        expect(date.textContent).not.toBe(initial);
        fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
        expect(date.textContent).toBe(initial);
    });

    it('opens an in-app calendar and loads a selected date', async () => {
        render(<MyJournal />);
        const picker = screen.getByRole('button', { name: 'Choose plan date' });
        fireEvent.click(picker);
        expect(picker).toHaveAttribute('aria-expanded', 'true');
        const dialog = screen.getByRole('dialog', { name: 'Choose plan date' });
        expect(within(dialog).getByText('Choose date')).toBeInTheDocument();
        const current = new Date();
        const chosen = new Date(
            current.getFullYear(),
            current.getMonth() + 1,
            1,
        );
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Next month' }),
        );
        const chosenLabel = chosen.toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        fireEvent.click(
            within(dialog).getByRole('button', {
                name: `Choose ${chosenLabel}`,
            }),
        );
        await waitFor(() =>
            expect(getJournalEntries).toHaveBeenLastCalledWith(
                `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, '0')}-01`,
            ),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('enters arrange mode on long press, renumbers meals and saves the order', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
            eatenAt: '2026-10-29T12:00:00+11:00',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        render(<MyJournal />);
        const first = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        vi.useFakeTimers();
        act(() => {
            fireEvent.pointerDown(first, {
                button: 0,
                clientX: 20,
                clientY: 100,
            });
            vi.advanceTimersByTime(450);
        });
        fireEvent.pointerUp(first);
        vi.useRealTimers();
        expect(
            screen.getByRole('group', { name: 'Arrange meals' }),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Move Fruit snack down' }),
        );
        expect(
            screen.getByRole('button', { name: 'Meal 1, Tofu bowl' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Meal 2, Fruit snack' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        await waitFor(() =>
            expect(reorderJournalEntries).toHaveBeenCalledWith(
                expect.any(String),
                ['2', '1'],
            ),
        );
        expect(
            screen.queryByRole('group', { name: 'Arrange meals' }),
        ).not.toBeInTheDocument();
    });

    it('lets a long-pressed meal move by touch below another meal', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        render(
            <div className="page-transition">
                <MyJournal />
            </div>,
        );
        const first = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        const cards =
            document.querySelectorAll<HTMLElement>('.journal-meal-card');
        const firstBounds = vi
            .spyOn(cards[0], 'getBoundingClientRect')
            .mockReturnValue({ top: 0, height: 70 } as DOMRect);
        const secondBounds = vi
            .spyOn(cards[1], 'getBoundingClientRect')
            .mockReturnValue({ top: 70, height: 70 } as DOMRect);
        vi.useFakeTimers();
        act(() => {
            fireEvent.touchStart(first, {
                touches: [{ clientX: 20, clientY: 20 }],
            });
            fireEvent.pointerDown(first, {
                button: 0,
                pointerType: 'touch',
                clientX: 20,
                clientY: 20,
            });
            vi.advanceTimersByTime(450);
        });
        vi.useRealTimers();
        fireEvent.touchMove(document, {
            touches: [{ clientX: 20, clientY: 140 }],
        });
        fireEvent.touchEnd(document);
        fireEvent.pointerUp(document, { pointerType: 'touch' });
        expect(
            screen.getByRole('button', { name: 'Meal 1, Tofu bowl' }),
        ).toBeInTheDocument();
        firstBounds.mockRestore();
        secondBounds.mockRestore();
    });

    it('refreshes the selected day on pull while keeping its entries visible', async () => {
        render(
            <div className="page-transition">
                <MyJournal />
            </div>,
        );
        await screen.findByRole('button', { name: /Fruit snack/ });
        let finish!: (entries: JournalEntry[]) => void;
        vi.mocked(getJournalEntries).mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        const heading = screen.getByRole('heading', { name: 'My Plan' });
        fireEvent.touchStart(heading, {
            touches: [{ clientX: 24, clientY: 80 }],
        });
        fireEvent.touchMove(heading, {
            touches: [{ clientX: 24, clientY: 220 }],
        });
        fireEvent.touchEnd(heading);
        expect(
            screen.getByRole('status', { name: 'Refreshing My Plan' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Fruit snack/ }),
        ).toBeInTheDocument();
        await act(async () => {
            finish([]);
        });
        expect(
            await screen.findByText('No meals in your plan for this day'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('status', { name: 'Refreshing My Plan' }),
        ).not.toBeInTheDocument();
    });

    it('keeps the current plan visible when a pull refresh fails', async () => {
        render(
            <div className="page-transition">
                <MyJournal />
            </div>,
        );
        await screen.findByRole('button', { name: /Fruit snack/ });
        vi.mocked(getJournalEntries).mockRejectedValueOnce(
            new Error('offline'),
        );
        const heading = screen.getByRole('heading', { name: 'My Plan' });
        fireEvent.touchStart(heading, {
            touches: [{ clientX: 24, clientY: 80 }],
        });
        fireEvent.touchMove(heading, {
            touches: [{ clientX: 24, clientY: 220 }],
        });
        fireEvent.touchEnd(heading);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not refresh your plan',
        );
        expect(
            screen.getByRole('button', { name: /Fruit snack/ }),
        ).toBeInTheDocument();
    });
    it('shows daily totals, expandable meals, a food list and key nutrients', async () => {
        render(<MyJournal />);
        expect(
            await screen.findByRole('button', { name: /Fruit snack/ }),
        ).toBeInTheDocument();
        const summary = screen.getByRole('group', {
            name: 'Daily nutrition summary',
        });
        expect(
            within(summary).getByText('146').parentElement,
        ).toHaveTextContent('146kcal');
        const meal = screen.getByRole('button', { name: /Fruit snack/ });
        expect(meal).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(meal);
        expect(meal).toHaveAttribute('aria-expanded', 'true');
        const mealDetails = document.getElementById('journal-meal-1')!;
        expect(within(mealDetails).getByText('Apple')).toBeInTheDocument();
        expect(
            within(mealDetails).getByRole('group', {
                name: 'Macro calorie proportions',
            }),
        ).toBeVisible();
        expect(within(mealDetails).getByText('100 g')).toBeInTheDocument();
        expect(within(mealDetails).getByText('200 g')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Food List' }));
        expect(screen.getByRole('tab', { name: 'Food List' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(
            within(document.getElementById('journal-foods-panel')!).getByText(
                'Apple',
            ),
        ).toBeInTheDocument();
        const daily = screen.getByRole('region', {
            name: 'Daily key nutrients',
        });
        expect(
            within(daily).getByRole('button', { name: 'Iron' }).closest('li'),
        ).toHaveTextContent('3 mg');
        expect(within(daily).getByText('This day · % DV')).toBeInTheDocument();
        expect(daily.querySelector('.meal-fiber-label')).toHaveTextContent(
            'Fibre',
        );
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
        await screen.findByRole('button', { name: /Fruit snack/ });
        vi.mocked(getJournalEntries).mockResolvedValue([]);
        const previous = new Date();
        previous.setDate(previous.getDate() - 1);
        fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
        await waitFor(() =>
            expect(getJournalEntries).toHaveBeenLastCalledWith(
                localDateValue(previous),
            ),
        );
        expect(
            await screen.findByText('No meals in your plan for this day'),
        ).toBeInTheDocument();
        expect(
            screen
                .getByRole('group', { name: 'Daily nutrition summary' })
                .querySelector('.nutrition-overview-calories'),
        ).toHaveTextContent('0kcal');
    });
});
