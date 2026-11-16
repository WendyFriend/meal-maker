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
import { getRecipes } from './services/recipeService';
import {
    saveJournalEntry,
    deleteJournalEntry,
    getJournalEntries,
    reorderJournalEntries,
    updateJournalEntryIngredients,
} from './services/journalService';
import type { JournalEntry } from '../shared/types/journal';
import { MICRONUTRIENTS } from '../shared/micronutrients';
import {
    getCachedIngredientNutrition,
    getIngredientNutrition,
} from './services/micronutrientService';
import type { IngredientInfo } from '../shared/types/types';
const sheetLookups = vi.hoisted(() => ({
    data: {} as Record<string, IngredientInfo>,
}));
vi.mock('./services/recipeService', () => ({ getRecipes: vi.fn() }));
vi.mock('./services/journalService', () => ({
    saveJournalEntry: vi.fn(),
    deleteJournalEntry: vi.fn(),
    getJournalEntries: vi.fn(),
    reorderJournalEntries: vi.fn(),
    updateJournalEntryIngredients: vi.fn(),
}));
vi.mock('./hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: sheetLookups.data,
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));
vi.mock('./services/micronutrientService', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('./services/micronutrientService')
    >()),
    getCachedIngredientNutrition: vi.fn(),
    getIngredientNutrition: vi.fn(),
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
    sheetLookups.data = {};
    vi.mocked(getJournalEntries).mockResolvedValue([entry]);
    vi.mocked(reorderJournalEntries).mockResolvedValue(undefined);
    vi.mocked(deleteJournalEntry).mockResolvedValue(undefined);
    vi.mocked(updateJournalEntryIngredients).mockImplementation(
        async (_id, ingredients) => ({ ...entry, ingredients }),
    );
    vi.mocked(getIngredientNutrition).mockRejectedValue(new Error('No match'));
    vi.mocked(getCachedIngredientNutrition).mockReturnValue(undefined);
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
            within(meal).getByText('Total:').parentElement,
        ).toHaveTextContent('146 kcal');
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
        expect(
            within(
                screen.getByRole('region', { name: 'Ingredients' }),
            ).queryByRole('heading', { name: 'Ingredients' }),
        ).not.toBeInTheDocument();
        const mealToggle = screen.getByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        const chevron = mealToggle.querySelector('.journal-meal-chevron');
        expect(chevron).toBeInTheDocument();
        expect(
            screen
                .getByRole('button', {
                    name: 'Edit ingredients in Fruit snack',
                })
                .closest('.journal-meal-row .journal-meal-ingredient-actions'),
        ).not.toBeNull();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        expect(mealToggle.querySelector('.journal-meal-chevron')).toBe(chevron);
        expect(
            screen
                .getByRole('button', {
                    name: 'Cancel ingredients changes',
                })
                .closest('.journal-meal-row .journal-meal-ingredient-actions'),
        ).not.toBeNull();
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
            within(document.getElementById('journal-meal-1')!).getByText(
                'Total:',
            ).parentElement,
        ).toHaveTextContent('198 kcal');
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Apple', weight: 200 }),
                ]),
                expect.anything(),
            ),
        );
        expect(
            within(document.getElementById('journal-meal-1')!)
                .getByText('Apple')
                .closest('li'),
        ).toHaveTextContent('200 g');
        expect(
            await screen.findByText('Ingredients updated.'),
        ).toBeInTheDocument();
    });

    it('does not refetch the plan after its own ingredient save', async () => {
        vi.mocked(updateJournalEntryIngredients).mockImplementation(
            async (_id, ingredients, source) => {
                notifyJournalChanged(source);
                return { ...entry, ingredients };
            },
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
        await screen.findByText('Ingredients updated.');
        await act(async () => Promise.resolve());
        expect(getJournalEntries).toHaveBeenCalledTimes(1);
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
            screen.queryByText('Ingredients updated.'),
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
                expect.anything(),
            ),
        );
        expect(
            vi.mocked(updateJournalEntryIngredients).mock.calls.at(-1)?.[1],
        ).toHaveLength(2);
    });

    it('resolves nutrition for an ingredient entered before search finishes', async () => {
        let finishLookup!: (nutrition: IngredientInfo) => void;
        vi.mocked(getIngredientNutrition).mockReturnValueOnce(
            new Promise((resolve) => {
                finishLookup = resolve;
            }),
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
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 3' });
        fireEvent.change(input, { target: { value: 'Fast rice' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(getIngredientNutrition).toHaveBeenCalledWith('Fast rice');
        expect(
            screen.getByRole('status', {
                name: 'Finding nutrition for Fast rice',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Nutrition unavailable for Fast rice',
            }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Fast rice',
                        nutritionUnavailable: true,
                    }),
                ]),
                expect.anything(),
            ),
        );
        await act(async () => {
            finishLookup({
                name: 'Rice, dry',
                caloriesPer100g: 360,
                proteinPer100g: 7,
                carbohydratePer100g: 78,
                fatPer100g: 1,
            });
        });
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Fast rice',
                        caloriesPer100g: 360,
                    }),
                ]),
                expect.anything(),
            ),
        );
        expect(
            screen.getByRole('meter', {
                name: 'Fast rice calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '360 kcal');
        expect(
            screen.queryByRole('status', {
                name: 'Finding nutrition for Fast rice',
            }),
        ).not.toBeInTheDocument();
    });

    it('fills a typed common food immediately without a remote nutrition request', async () => {
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
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 3' });
        fireEvent.change(input, { target: { value: 'banana' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(
            screen.getByRole('meter', {
                name: 'Banana calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '89 kcal');
        expect(getIngredientNutrition).not.toHaveBeenCalled();
    });

    it('shows a cached food’s nutrition immediately on Enter', async () => {
        vi.mocked(getCachedIngredientNutrition).mockReturnValue({
            name: 'Rice, dry',
            caloriesPer100g: 360,
            proteinPer100g: 7,
            carbohydratePer100g: 78,
            fatPer100g: 1,
        });
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
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 3' });
        fireEvent.change(input, { target: { value: 'Fast rice' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(
            screen.getByRole('meter', {
                name: 'Fast rice calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '360 kcal');
        expect(getIngredientNutrition).not.toHaveBeenCalled();
    });

    it('keeps the entered ingredient when Enter and Save happen before a rerender', async () => {
        vi.mocked(getIngredientNutrition).mockResolvedValueOnce({
            name: 'Rice, dry',
            caloriesPer100g: 360,
            proteinPer100g: 7,
            carbohydratePer100g: 78,
            fatPer100g: 1,
        });
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
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 3' });
        fireEvent.change(input, { target: { value: 'Fast rice' } });
        await act(async () => {
            fireEvent.keyDown(input, { key: 'Enter' });
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Save ingredients changes',
                }),
            );
        });
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Fast rice',
                        caloriesPer100g: 360,
                    }),
                ]),
                expect.anything(),
            ),
        );
    });

    it('does not add a second placeholder when Enter also blurs the ingredient field', async () => {
        vi.mocked(getIngredientNutrition).mockResolvedValueOnce({
            name: 'Rice, dry',
            caloriesPer100g: 360,
            proteinPer100g: 7,
            carbohydratePer100g: 78,
            fatPer100g: 1,
        });
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
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 3' });
        fireEvent.change(input, { target: { value: 'Fast rice' } });
        act(() => {
            input.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Enter',
                    bubbles: true,
                    cancelable: true,
                }),
            );
            input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        });
        expect(
            within(document.getElementById('journal-meal-1')!).getAllByText(
                'Fast rice',
            ),
        ).toHaveLength(1);
        await waitFor(() =>
            expect(
                screen.getByRole('meter', {
                    name: 'Fast rice calorie contribution',
                }),
            ).toHaveAttribute('aria-valuetext', '360 kcal'),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() => {
            const ingredients = vi
                .mocked(updateJournalEntryIngredients)
                .mock.calls.at(-1)?.[1];
            expect(
                ingredients?.filter(
                    (ingredient) => ingredient.name === 'Fast rice',
                ),
            ).toHaveLength(1);
            expect(
                ingredients?.find(
                    (ingredient) => ingredient.name === 'Fast rice',
                ),
            ).toMatchObject({ caloriesPer100g: 360 });
        });
    });

    it('persists nutrition found in an ingredient sheet to the planned meal', async () => {
        vi.mocked(getJournalEntries).mockResolvedValueOnce([
            {
                ...entry,
                ingredients: [
                    {
                        name: 'Mystery rice',
                        weight: 100,
                        caloriesPer100g: 0,
                        proteinPer100g: 0,
                        carbohydratePer100g: 0,
                        fatPer100g: 0,
                        nutritionUnavailable: true,
                    },
                    {
                        name: 'Mystery rice',
                        weight: 50,
                        caloriesPer100g: 0,
                        proteinPer100g: 0,
                        carbohydratePer100g: 0,
                        fatPer100g: 0,
                        nutritionUnavailable: true,
                    },
                ],
            },
        ]);
        sheetLookups.data = {
            'mystery rice': {
                name: 'Brown rice, dry',
                caloriesPer100g: 360,
                proteinPer100g: 7,
                carbohydratePer100g: 78,
                fatPer100g: 1,
            },
        };
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(
            screen.getAllByRole('button', { name: 'Mystery rice' })[0],
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Mystery rice',
                        weight: 100,
                        caloriesPer100g: 360,
                    }),
                    expect.objectContaining({
                        name: 'Mystery rice',
                        weight: 50,
                        caloriesPer100g: 360,
                    }),
                ]),
                expect.anything(),
            ),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Nutrition unavailable for Mystery rice',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen
                .getAllByRole('meter', {
                    name: 'Mystery rice calorie contribution',
                })
                .map((meter) => meter.getAttribute('aria-valuetext')),
        ).toEqual(['360 kcal', '180 kcal']);
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

    it('adds a copy of a saved recipe as the last meal of the day', async () => {
        const recipe = {
            id: 'recipe-1',
            userId: 'user-1',
            recipeName: 'Tofu bowl',
            ingredients: entry.ingredients,
            instructions: ['Cook'],
        };
        vi.mocked(getRecipes).mockResolvedValue([recipe]);
        vi.mocked(saveJournalEntry).mockImplementation(async (input) => ({
            ...input,
            id: 'new',
        }));
        render(<MyJournal />);
        await screen.findByRole('button', { name: 'Meal 1, Fruit snack' });

        fireEvent.click(screen.getByRole('button', { name: 'Add meal' }));
        const sheet = screen.getByRole('dialog', { name: 'Add Meal' });
        fireEvent.click(
            within(sheet).getByRole('button', { name: /Add from My Recipes/ }),
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Add Tofu bowl' }),
        );

        expect(
            await screen.findByRole('button', { name: 'Meal 2, Tofu bowl' }),
        ).toBeInTheDocument();
        const [input] = vi.mocked(saveJournalEntry).mock.calls[0];
        expect(input).toMatchObject({
            mealName: 'Tofu bowl',
            ingredients: entry.ingredients,
        });
        // Listed after the day's existing meal; a snapshot, not a link.
        expect(Date.parse(input.eatenAt)).toBeGreaterThan(
            Date.parse(entry.eatenAt),
        );
        expect(input).not.toHaveProperty('id');
        expect(screen.getByText('Meal added.')).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', { name: 'Add Meal' }),
            ).not.toBeInTheDocument(),
        );
    });

    it('opens Add Meal for the selected day to enter a meal manually', async () => {
        const onEnterMeal = vi.fn();
        render(<MyJournal onEnterMeal={onEnterMeal} />);
        await screen.findByRole('button', { name: 'Meal 1, Fruit snack' });
        fireEvent.click(screen.getByRole('button', { name: 'Add meal' }));
        fireEvent.click(screen.getByRole('button', { name: /Create a new one/ }));
        expect(onEnterMeal).toHaveBeenCalledExactlyOnceWith({
            day: localDateValue(),
            eatenAt: expect.any(String),
        });
    });

    it('moves a meal with Alt+Arrow keys and saves at once', async () => {
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
        fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });

        expect(first).toHaveAccessibleName('Meal 2, Fruit snack');
        expect(
            screen.getByRole('button', { name: 'Meal 1, Tofu bowl' }),
        ).toBeInTheDocument();
        expect(reorderJournalEntries).toHaveBeenCalledExactlyOnceWith(
            expect.any(String),
            ['2', '1'],
        );
        // No arrange mode, so nothing to confirm.
        expect(
            screen.queryByRole('button', { name: /Save meal order/ }),
        ).not.toBeInTheDocument();
    });

    it('moves a meal from the right-click menu', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        render(<MyJournal />);
        const row = await screen.findByRole('button', {
            name: 'Meal 2, Tofu bowl',
        });
        fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });
        fireEvent.click(screen.getByRole('menuitem', { name: 'Move Up' }));
        expect(
            screen.getByRole('button', { name: 'Meal 1, Tofu bowl' }),
        ).toBeInTheDocument();
        expect(reorderJournalEntries).toHaveBeenCalledWith(expect.any(String), [
            '2',
            '1',
        ]);
    });

    it('puts meals back and explains when saving the order fails', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        vi.mocked(reorderJournalEntries).mockRejectedValueOnce(
            new Error('offline'),
        );
        render(<MyJournal />);
        const first = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not save meal order. Try again.',
        );
        expect(first).toHaveAccessibleName('Meal 1, Fruit snack');
    });

    it('removes a meal on a left swipe and restores it with Undo', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        render(<MyJournal />);
        const row = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        const touch = { pointerId: 1, pointerType: 'touch', clientY: 20 };
        fireEvent.pointerDown(row, { ...touch, button: 0, clientX: 160 });
        fireEvent.pointerMove(row, { ...touch, clientX: 70 });
        fireEvent.pointerUp(row, { ...touch, clientX: 70 });
        fireEvent.click(
            screen.getByRole('button', { name: 'Delete Fruit snack' }),
        );

        expect(row.closest('.journal-meal-card')).toHaveClass(
            'collection-row-exiting',
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: /Fruit snack/ }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole('button', { name: 'Meal 1, Tofu bowl' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Meal removed.');

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(
            screen.getByRole('button', { name: 'Meal 1, Fruit snack' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Meal removed.')).not.toBeInTheDocument();
        expect(deleteJournalEntry).not.toHaveBeenCalled();
    });

    it('deletes a meal from the right-click menu once Undo expires', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        render(<MyJournal />);
        const row = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });
        const menu = screen.getByRole('menu', { name: 'Fruit snack actions' });
        expect(
            within(menu).getByRole('menuitem', { name: 'Move Down' }),
        ).toBeInTheDocument();
        expect(
            within(menu).queryByRole('menuitem', { name: 'Move Up' }),
        ).not.toBeInTheDocument();
        vi.useFakeTimers();
        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
        expect(screen.getByRole('status')).toHaveTextContent('Meal removed.');
        expect(deleteJournalEntry).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(5000));
        vi.useRealTimers();
        expect(deleteJournalEntry).toHaveBeenCalledExactlyOnceWith(
            '1',
            expect.any(Symbol),
        );
        expect(screen.queryByText('Meal removed.')).not.toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: /Fruit snack/ }),
            ).not.toBeInTheDocument(),
        );
    });

    it('restores a meal and explains when removing it fails', async () => {
        vi.mocked(deleteJournalEntry).mockRejectedValueOnce(new Error('nope'));
        render(<MyJournal />);
        const row = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        fireEvent.contextMenu(row, { button: 2, clientX: 120, clientY: 140 });
        expect(
            screen.queryByRole('menuitem', { name: /Move/ }),
        ).not.toBeInTheDocument();
        vi.useFakeTimers();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
        act(() => vi.advanceTimersByTime(5000));
        vi.useRealTimers();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not remove meal. Try again.',
        );
        expect(
            screen.getByRole('button', { name: 'Meal 1, Fruit snack' }),
        ).toBeInTheDocument();
    });

    it('lifts a meal on long press, drops it below another and saves', async () => {
        const second: JournalEntry = {
            ...entry,
            id: '2',
            mealName: 'Tofu bowl',
        };
        vi.mocked(getJournalEntries).mockResolvedValue([entry, second]);
        render(<MyJournal />);
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
        try {
            act(() => {
                fireEvent.pointerDown(first, {
                    button: 0,
                    pointerType: 'touch',
                    clientX: 20,
                    clientY: 20,
                });
                vi.advanceTimersByTime(450);
            });
            expect(cards[0]).toHaveClass('journal-meal-dragging');
            act(() => {
                fireEvent.touchMove(document, {
                    touches: [{ clientX: 20, clientY: 140 }],
                });
                vi.advanceTimersByTime(20);
            });
            // The meal numbers follow the drag before anything is saved.
            expect(first).toHaveAccessibleName('Meal 2, Fruit snack');
            expect(reorderJournalEntries).not.toHaveBeenCalled();
            fireEvent.touchEnd(document);
            act(() => vi.advanceTimersByTime(220));
        } finally {
            vi.useRealTimers();
        }
        expect(cards[0]).not.toHaveClass('journal-meal-dragging');
        expect(
            screen.getByRole('button', { name: 'Meal 1, Tofu bowl' }),
        ).toBeInTheDocument();
        expect(reorderJournalEntries).toHaveBeenCalledExactlyOnceWith(
            expect.any(String),
            ['2', '1'],
        );
        // The release must not also open the meal.
        fireEvent.click(first);
        expect(first).toHaveAttribute('aria-expanded', 'false');
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
            within(mealDetails).getByText('Total:').parentElement,
        ).toHaveTextContent('146 kcal');
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
        expect(
            screen.queryByRole('region', { name: 'Daily key nutrients' }),
        ).not.toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Food List' }), {
            key: 'ArrowRight',
        });
        expect(
            screen.getByRole('tab', { name: 'Key nutrients' }),
        ).toHaveAttribute('aria-selected', 'true');
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

it('expands a collapsed meal from its name, then opens it from the name', async () => {
    const onOpenMeal = vi.fn();
    render(<MyJournal onOpenMeal={onOpenMeal} />);
    const toggle = await screen.findByRole('button', {
        name: 'Meal 1, Fruit snack',
    });
    // Collapsed: no open button, and the chevron only keeps its space.
    expect(
        screen.queryByRole('button', { name: 'Open Fruit snack recipe' }),
    ).not.toBeInTheDocument();
    const card = document.querySelector<HTMLElement>('.journal-meal-card')!;
    expect(
        card.querySelector(
            '.journal-meal-open-chevron:not(.ingredient-name-chevron-space)',
        ),
    ).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenMeal).not.toHaveBeenCalled();

    // Expanded: the name and its chevron open the meal page.
    const open = screen.getByRole('button', {
        name: 'Open Fruit snack recipe',
    });
    expect(open).toHaveTextContent('Fruit snack');
    expect(
        open.querySelector(
            '.ingredient-name-chevron:not(.ingredient-name-chevron-space)',
        ),
    ).not.toBeNull();
    expect(toggle).not.toContainElement(open);
    fireEvent.click(open);
    expect(onOpenMeal).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', mealName: 'Fruit snack' }),
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The trailing chevron still collapses it.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(onOpenMeal).toHaveBeenCalledOnce();
});

it('still lifts a meal when the long press starts on its name', async () => {
    vi.mocked(getJournalEntries).mockResolvedValue([
        entry,
        { ...entry, id: '2', mealName: 'Tofu bowl' },
    ]);
    const onOpenMeal = vi.fn();
    render(<MyJournal onOpenMeal={onOpenMeal} />);
    fireEvent.click(
        await screen.findByRole('button', { name: 'Meal 1, Fruit snack' }),
    );
    const open = screen.getByRole('button', {
        name: 'Open Fruit snack recipe',
    });
    const card = document.querySelector<HTMLElement>('.journal-meal-card')!;
    vi.useFakeTimers();
    try {
        act(() => {
            fireEvent.pointerDown(open, {
                button: 0,
                pointerType: 'touch',
                clientX: 20,
                clientY: 20,
            });
            vi.advanceTimersByTime(450);
        });
        expect(card).toHaveClass('journal-meal-dragging');
        fireEvent.touchEnd(document);
        act(() => vi.advanceTimersByTime(220));
    } finally {
        vi.useRealTimers();
    }
    // The release does not also open the recipe.
    fireEvent.click(open);
    expect(onOpenMeal).not.toHaveBeenCalled();
});

it('shows no recipe chevron without a way to open meals', async () => {
    render(<MyJournal />);
    await screen.findByRole('button', { name: 'Meal 1, Fruit snack' });
    expect(
        screen.queryByRole('button', { name: /recipe$/ }),
    ).not.toBeInTheDocument();
});

describe('saving ingredient edits on leave', () => {
    async function startAddingKiwi() {
        const view = render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Meal 1, Fruit snack' }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
        fireEvent.change(
            screen.getByRole('combobox', { name: 'Ingredient 3' }),
            { target: { value: 'Kiwi' } },
        );
        return view;
    }

    function tapOutside(moveBy = 0) {
        fireEvent.pointerDown(document.body, { clientX: 10, clientY: 10 });
        fireEvent.pointerUp(document.body, {
            clientX: 10,
            clientY: 10 + moveBy,
        });
    }

    it('saves an ingredient still in the field when tapping outside the meal', async () => {
        await startAddingKiwi();
        tapOutside();
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                [
                    expect.objectContaining({ name: 'Apple' }),
                    expect.objectContaining({ name: 'Orange' }),
                    expect.objectContaining({ name: 'Kiwi' }),
                ],
                expect.anything(),
            ),
        );
        expect(updateJournalEntryIngredients).toHaveBeenCalledOnce();
        expect(
            await screen.findByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        ).toBeInTheDocument();
    });

    it('keeps editing while scrolling or tapping inside the meal', async () => {
        await startAddingKiwi();
        tapOutside(60);
        fireEvent.pointerDown(
            screen.getByRole('button', { name: 'Add ingredient' }),
        );
        fireEvent.pointerUp(
            screen.getByRole('button', { name: 'Add ingredient' }),
        );
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
        expect(
            screen.getByRole('combobox', { name: 'Ingredient 3' }),
        ).toHaveValue('Kiwi');
    });

    it('discards only from ✕', async () => {
        await startAddingKiwi();
        fireEvent.click(
            screen.getByRole('button', { name: 'Cancel ingredients changes' }),
        );
        tapOutside();
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
    });

    it('saves when leaving the page mid-edit', async () => {
        const { unmount } = await startAddingKiwi();
        unmount();
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalledWith(
                '1',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Kiwi' }),
                ]),
                expect.anything(),
            ),
        );
    });
});

describe('editing header', () => {
    async function startEditing() {
        const onOpenMeal = vi.fn();
        render(<MyJournal onOpenMeal={onOpenMeal} />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Meal 1, Fruit snack' }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        );
        return onOpenMeal;
    }

    it('shows only cancel and save beside the name while editing', async () => {
        await startEditing();
        const row = document.querySelector<HTMLElement>('.journal-meal-row')!;
        expect(row).toHaveClass('journal-meal-row-editing');
        expect(
            within(row)
                .getAllByRole('button')
                .map((button) => button.getAttribute('aria-label')),
        ).toEqual(['Cancel ingredients changes', 'Save ingredients changes']);
        expect(
            screen.queryByRole('button', { name: 'Open Fruit snack recipe' }),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        // Back to the normal header: open, edit and collapse.
        expect(
            await screen.findByRole('button', {
                name: 'Open Fruit snack recipe',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Meal 1, Fruit snack' }),
        ).toHaveAttribute('aria-expanded', 'true');
    });

    it('offers Undo after discarding changes', async () => {
        await startEditing();
        fireEvent.change(
            screen.getByRole('spinbutton', { name: /Apple weight/ }),
            { target: { value: '321' } },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Cancel ingredients changes' }),
        );
        expect(
            screen.queryByRole('spinbutton', { name: /Apple weight/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Changes discarded.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(
            screen.getByRole('spinbutton', { name: /Apple weight/ }),
        ).toHaveValue(321);
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
    });

    it('discards an unchanged edit without a toast', async () => {
        await startEditing();
        fireEvent.click(
            screen.getByRole('button', { name: 'Cancel ingredients changes' }),
        );
        expect(
            screen.queryByText('Changes discarded.'),
        ).not.toBeInTheDocument();
    });
});
