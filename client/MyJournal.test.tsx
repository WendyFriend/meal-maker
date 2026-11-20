import { StrictMode } from 'react';
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
import { fixMenuOption } from './test/fixMenu';
import { IngredientCollectionContext } from './ingredients/IngredientCollectionContext';
import { localDateValue } from './journal/nutrition';
import { MissingJournalEntryError } from './services/journalErrors';
import { notifyJournalChanged } from './journal/changes';
import { getRecipes } from './services/recipeService';
import {
    saveJournalEntry,
    deleteJournalEntry,
    getJournalEntries,
    reorderJournalEntries,
    updateJournalEntryIngredients,
    updateJournalEntryName,
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
    updateJournalEntryName: vi.fn(),
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
/** Starts editing a meal from its menu (right-click; long press on touch). */
function editMeal(name: string) {
    const row = [...document.querySelectorAll('.journal-meal-row')].find(
        (element) => element.textContent?.includes(name),
    );
    fireEvent.contextMenu(row!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
}

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
describe('My Diary', () => {
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
        // No pen beside the name: editing starts from the meal's menu.
        expect(
            screen.queryByRole('button', {
                name: 'Edit ingredients in Fruit snack',
            }),
        ).not.toBeInTheDocument();
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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
            'Could not save ingredients. Please try again.',
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
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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

    it('corrects an ingredient name in place, keeping its weight', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        editMeal('Fruit snack');
        fireEvent.click(screen.getByRole('button', { name: 'Rename Orange' }));
        const input = screen.getByRole('combobox', { name: 'Ingredient 2' });
        expect(input).toHaveFocus();
        expect(input).toHaveValue('Orange');
        fireEvent.change(input, { target: { value: 'banana' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(
            screen.getByRole('meter', {
                name: 'Banana calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '178 kcal');
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        const saved = vi.mocked(updateJournalEntryIngredients).mock.calls[0][1];
        expect(saved.map(({ name, weight }) => [name, weight])).toEqual([
            ['Apple', 100],
            ['Banana', 200],
        ]);
    });

    it('shows a food’s nutrition while editing, keeping fixes in the draft', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        editMeal('Fruit snack');
        // The name still renames; its picture opens the sheet.
        expect(
            screen.getByRole('button', { name: 'Rename Orange' }),
        ).toBeInTheDocument();
        const picture = screen.getByRole('button', {
            name: 'Open Orange nutrition',
        });
        expect(picture).toHaveClass('ingredient-thumbnail-button');
        fireEvent.click(picture);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Doesn’t look right?' }),
        );
        fireEvent.click(fixMenuOption('Correct the numbers'));
        fireEvent.change(
            screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
            { target: { value: '60' } },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredient changes' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
        // Still editing: the fix waits for ✓ with everything else.
        expect(
            screen.getByRole('meter', { name: 'Orange calorie contribution' }),
        ).toHaveAttribute('aria-valuetext', '120 kcal');
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        const saved = vi.mocked(updateJournalEntryIngredients).mock.calls[0][1];
        expect(saved[1]).toMatchObject({
            name: 'Orange',
            weight: 200,
            caloriesPer100g: 60,
        });
    });

    it('edits a weight straight from view mode', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Edit Orange weight, 200 grams',
            }),
        );
        const weight = screen.getByRole('spinbutton', {
            name: 'Orange weight in grams',
        });
        expect(weight).toHaveFocus();
        fireEvent.change(weight, { target: { value: '150' } });
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        expect(
            vi
                .mocked(updateJournalEntryIngredients)
                .mock.calls[0][1].map(({ name, weight }) => [name, weight]),
        ).toEqual([
            ['Apple', 100],
            ['Orange', 150],
        ]);
    });

    it('adds an ingredient from view mode with one tap', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Add ingredient to Fruit snack',
            }),
        );
        const input = screen.getByRole('combobox', { name: 'Ingredient 3' });
        expect(input).toHaveFocus();
        expect(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        ).toBeInTheDocument();
    });

    it('keeps the old name on Escape or an emptied field', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        editMeal('Fruit snack');
        fireEvent.click(screen.getByRole('button', { name: 'Rename Orange' }));
        let input = screen.getByRole('combobox', { name: 'Ingredient 2' });
        fireEvent.change(input, { target: { value: 'Oragne' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(
            screen.getByRole('button', { name: 'Rename Orange' }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Rename Orange' }));
        input = screen.getByRole('combobox', { name: 'Ingredient 2' });
        fireEvent.change(input, { target: { value: '  ' } });
        fireEvent.blur(input);
        expect(
            screen.getByRole('button', { name: 'Rename Orange' }),
        ).toBeInTheDocument();
    });

    it('saves a name correction still in its field', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        editMeal('Fruit snack');
        fireEvent.click(screen.getByRole('button', { name: 'Rename Apple' }));
        fireEvent.change(
            screen.getByRole('combobox', { name: 'Ingredient 1' }),
            { target: { value: 'banana' } },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        expect(
            vi
                .mocked(updateJournalEntryIngredients)
                .mock.calls[0][1].map(({ name, weight, caloriesPer100g }) => [
                    name,
                    weight,
                    caloriesPer100g,
                ]),
        ).toEqual([
            ['banana', 100, 89],
            ['Orange', 200, 47],
        ]);
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
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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
        editMeal('Fruit snack');
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

    it('corrects a food’s numbers from its nutrition sheet', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Orange' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Doesn’t look right?' }),
        );
        fireEvent.click(fixMenuOption('Correct the numbers'));
        const calories = screen.getByRole('spinbutton', {
            name: 'Calories per 100 grams',
        });
        fireEvent.change(calories, { target: { value: '60' } });
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredient changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        const saved = vi.mocked(updateJournalEntryIngredients).mock.calls[0][1];
        // Only this food changes; it keeps its typed name and weight.
        expect(saved[0]).toEqual(entry.ingredients[0]);
        expect(saved[1]).toMatchObject({
            name: 'Orange',
            weight: 200,
            caloriesPer100g: 60,
            proteinPer100g: 0.9,
        });
        expect(saved[1]).not.toHaveProperty('nutritionUnavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
        expect(
            screen.getByRole('meter', {
                name: 'Orange calorie contribution',
            }),
        ).toHaveAttribute('aria-valuetext', '120 kcal');
    });

    it('renames a food in place from its sheet title', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        render(
            <IngredientCollectionContext.Provider
                value={{ ingredients: [], save }}
            >
                <MyJournal />
            </IngredientCollectionContext.Provider>,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Orange' }));
        fireEvent.click(
            await screen.findByRole('button', { name: /^Rename / }),
        );
        let name = screen.getByRole('textbox', { name: 'Ingredient name' });
        expect(name).toHaveFocus();
        // Only the title changes: nothing is added around it.
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        fireEvent.change(name, { target: { value: 'Typo' } });
        fireEvent.keyDown(name, { key: 'Escape' });
        expect(
            screen.queryByRole('textbox', { name: 'Ingredient name' }),
        ).not.toBeInTheDocument();
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /^Rename / }));
        name = screen.getByRole('textbox', { name: 'Ingredient name' });
        fireEvent.change(name, { target: { value: 'Blood orange' } });
        fireEvent.keyDown(name, { key: 'Enter' });
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        const saved = vi.mocked(updateJournalEntryIngredients).mock.calls[0][1];
        // Renamed in the meal, keeping its nutrition and weight.
        expect(saved[1]).toMatchObject({
            name: 'Blood orange',
            weight: 200,
            caloriesPer100g: entry.ingredients[1].caloriesPer100g,
        });
        // Not saved to My Ingredients unless starred; the sheet stays open.
        expect(save).not.toHaveBeenCalled();
        expect(
            await screen.findByRole('button', { name: 'Rename Blood orange' }),
        ).toBeInTheDocument();
    });

    it('saves a food to My Ingredients with the sheet’s star', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const open = vi.fn();
        render(
            <IngredientCollectionContext.Provider
                value={{ ingredients: [], save, open }}
            >
                <MyJournal />
            </IngredientCollectionContext.Provider>,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Orange' }));
        const star = await screen.findByRole('button', {
            name: 'Save to My Ingredients',
        });
        expect(star).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(star);
        // Filled and confirmed on tap.
        expect(
            screen.getByRole('button', { name: 'Remove from My Ingredients' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByText('Saved to My Ingredients.'),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Orange' }),
            ),
        );
        expect(save.mock.calls[0][0]).not.toHaveProperty('weight');

        fireEvent.click(screen.getByRole('button', { name: 'View' }));
        expect(open).toHaveBeenCalled();
    });

    it('saves a renamed food when tapping outside the name', async () => {
        render(<MyJournal />);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Orange' }));
        fireEvent.click(
            await screen.findByRole('button', { name: /^Rename / }),
        );
        const name = screen.getByRole('textbox', { name: 'Ingredient name' });
        fireEvent.change(name, { target: { value: 'Blood orange' } });
        // A drag (scrolling the sheet) keeps editing.
        const facts = screen.getByText('Calories');
        fireEvent.pointerDown(facts, { pointerId: 1, clientX: 0, clientY: 0 });
        fireEvent.pointerUp(facts, { pointerId: 1, clientX: 0, clientY: 40 });
        expect(name).toBeInTheDocument();
        // A tap anywhere else saves, like ✓.
        fireEvent.pointerDown(facts, { pointerId: 2, clientX: 0, clientY: 0 });
        fireEvent.pointerUp(facts, { pointerId: 2, clientX: 0, clientY: 0 });
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenCalled(),
        );
        expect(
            vi.mocked(updateJournalEntryIngredients).mock.calls[0][1][1],
        ).toMatchObject({ name: 'Blood orange', weight: 200 });
        expect(
            await screen.findByRole('button', { name: 'Rename Blood orange' }),
        ).toBeInTheDocument();
    });

    it('removes a saved food from My Ingredients with the filled star', async () => {
        const remove = vi.fn().mockResolvedValue(undefined);
        render(
            <IngredientCollectionContext.Provider
                value={{
                    ingredients: [
                        {
                            ...entry.ingredients[1],
                            ingredientId: 'orange-id',
                        },
                    ],
                    save: vi.fn(),
                    remove,
                }}
            >
                <MyJournal />
            </IngredientCollectionContext.Provider>,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Orange' }));
        const star = await screen.findByRole('button', {
            name: 'Remove from My Ingredients',
        });
        expect(star).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(star);
        // Emptied and confirmed on tap.
        expect(
            screen.getByRole('button', { name: 'Save to My Ingredients' }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(
            screen.getByText('Removed from My Ingredients.'),
        ).toBeInTheDocument();
        await waitFor(() => expect(remove).toHaveBeenCalledWith('orange-id'));
    });

    it('withdraws the star and toast when saving to My Ingredients fails', async () => {
        const save = vi.fn().mockRejectedValue(new Error('offline'));
        render(
            <IngredientCollectionContext.Provider
                value={{ ingredients: [], save }}
            >
                <MyJournal />
            </IngredientCollectionContext.Provider>,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Meal 1, Fruit snack',
            }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Orange' }));
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Save to My Ingredients',
            }),
        );
        expect(
            await screen.findByText(
                'Could not save to My Ingredients. Please try again.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Saved to My Ingredients.'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Save to My Ingredients' }),
        ).toHaveAttribute('aria-pressed', 'false');
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
            screen.queryByRole('heading', { name: 'My Diary' }),
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
        const date = screen.getByRole('button', { name: 'Choose diary date' });
        const initial = date.textContent;
        fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
        expect(date.textContent).not.toBe(initial);
        fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
        expect(date.textContent).toBe(initial);
    });

    it('opens an in-app calendar and loads a selected date', async () => {
        render(<MyJournal />);
        const picker = screen.getByRole('button', {
            name: 'Choose diary date',
        });
        fireEvent.click(picker);
        expect(picker).toHaveAttribute('aria-expanded', 'true');
        const dialog = screen.getByRole('dialog', {
            name: 'Choose diary date',
        });
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

    describe('creating a meal in place', () => {
        const weekday = new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
        });

        async function startNewMeal() {
            vi.mocked(saveJournalEntry).mockImplementation(async (input) => ({
                ...input,
                id: 'new',
            }));
            // As in the app: StrictMode remounts must not drop the new meal.
            render(
                <StrictMode>
                    <MyJournal />
                </StrictMode>,
            );
            await screen.findByRole('button', { name: 'Meal 1, Fruit snack' });
            fireEvent.click(screen.getByRole('button', { name: 'Add meal' }));
            fireEvent.click(
                screen.getByRole('button', { name: /Create a new one/ }),
            );
            return screen.getByRole('combobox', { name: 'Ingredient 1' });
        }

        function tapOutside() {
            fireEvent.pointerDown(document.body, { clientX: 10, clientY: 10 });
            fireEvent.pointerUp(document.body, { clientX: 10, clientY: 10 });
        }

        it('adds an open meal card with the ingredient field focused', async () => {
            const field = await startNewMeal();
            await waitFor(() => expect(field).toHaveFocus());
            expect(
                screen.queryByRole('dialog', { name: 'Add Meal' }),
            ).not.toBeInTheDocument();
            expect(screen.getByText('New meal')).toBeInTheDocument();
            // Nothing to total until an ingredient is added.
            expect(
                screen.queryByRole('group', { name: 'Meal total' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Save ingredients changes',
                }),
            ).toBeInTheDocument();
            expect(saveJournalEntry).not.toHaveBeenCalled();
        });

        it('creates the meal on ✓, named from the day and first ingredient', async () => {
            const field = await startNewMeal();
            fireEvent.change(field, { target: { value: 'Lentils' } });
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Save ingredients changes',
                }),
            );

            expect(
                await screen.findByRole('button', {
                    name: `Meal 2, ${weekday} lentils`,
                }),
            ).toBeInTheDocument();
            const [input] = vi.mocked(saveJournalEntry).mock.calls[0];
            expect(input).toMatchObject({
                mealName: `${weekday} lentils`,
                ingredients: [expect.objectContaining({ name: 'Lentils' })],
            });
            expect(Date.parse(input.eatenAt)).toBeGreaterThan(
                Date.parse(entry.eatenAt),
            );
            expect(saveJournalEntry).toHaveBeenCalledOnce();
            expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
            expect(await screen.findByText('Meal added.')).toBeInTheDocument();
        });

        it('names the new meal from a tap on its name', async () => {
            const field = await startNewMeal();
            fireEvent.change(field, { target: { value: 'Lentils' } });
            fireEvent.blur(field);
            fireEvent.click(
                screen.getByRole('button', { name: 'Rename New meal' }),
            );
            // Empty, with the muted name as its placeholder.
            const name = screen.getByRole('textbox', { name: 'Meal name' });
            expect(name).toHaveValue('');
            expect(name).toHaveAttribute('placeholder', 'New meal');
            fireEvent.change(name, { target: { value: 'Lunch' } });
            fireEvent.keyDown(name, { key: 'Enter' });
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Save ingredients changes',
                }),
            );
            expect(
                await screen.findByRole('button', { name: 'Meal 2, Lunch' }),
            ).toBeInTheDocument();
            expect(vi.mocked(saveJournalEntry).mock.calls[0][0]).toMatchObject({
                mealName: 'Lunch',
                ingredients: [expect.objectContaining({ name: 'Lentils' })],
            });
        });

        it('keeps the keyboard up from one ingredient to the next', async () => {
            const field = await startNewMeal();
            await waitFor(() => expect(field).toHaveFocus());
            fireEvent.change(field, { target: { value: 'Lentils' } });
            fireEvent.keyDown(field, { key: 'Enter' });

            // Enter on a name goes to its weight…
            const lentils = screen.getByRole('spinbutton', {
                name: 'Lentils weight in grams',
            });
            expect(lentils).toHaveFocus();
            fireEvent.change(lentils, { target: { value: '150' } });
            fireEvent.keyDown(lentils, { key: 'Enter' });

            // …and Enter on a weight to the next name.
            const second = screen.getByRole('combobox', {
                name: 'Ingredient 2',
            });
            expect(second).toHaveFocus();
            fireEvent.change(second, { target: { value: 'Rice' } });
            fireEvent.keyDown(second, { key: 'Enter' });
            const rice = screen.getByRole('spinbutton', {
                name: 'Rice weight in grams',
            });
            expect(rice).toHaveFocus();
            fireEvent.keyDown(rice, { key: 'Enter' });

            // Enter on an empty name finishes adding.
            const third = screen.getByRole('combobox', {
                name: 'Ingredient 3',
            });
            expect(third).toHaveAttribute('enterkeyhint', 'done');
            fireEvent.keyDown(third, { key: 'Enter' });
            fireEvent.blur(third);
            expect(
                screen.queryByRole('combobox', { name: 'Ingredient 3' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Add ingredient' }),
            ).toBeInTheDocument();
            expect(lentils).toHaveValue(150);
            expect(screen.getByText('Rice')).toBeInTheDocument();
        });

        it('saves when tapping away, like other ingredient edits', async () => {
            const field = await startNewMeal();
            fireEvent.change(field, { target: { value: 'Lentils' } });
            tapOutside();
            await waitFor(() =>
                expect(saveJournalEntry).toHaveBeenCalledOnce(),
            );
        });

        it('drops an empty new meal when tapping away', async () => {
            await startNewMeal();
            tapOutside();
            await waitFor(() =>
                expect(screen.queryByText('New meal')).not.toBeInTheDocument(),
            );
            expect(saveJournalEntry).not.toHaveBeenCalled();
            expect(
                screen.queryByText('Meal discarded.'),
            ).not.toBeInTheDocument();
        });

        it('discards with ✕ and Undo brings the meal back', async () => {
            const field = await startNewMeal();
            fireEvent.change(field, { target: { value: 'Lentils' } });
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Cancel ingredients changes',
                }),
            );
            expect(screen.queryByText('New meal')).not.toBeInTheDocument();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Undo' }),
            );

            expect(screen.getByText('New meal')).toBeInTheDocument();
            expect(screen.getByText('Lentils')).toBeInTheDocument();
            expect(saveJournalEntry).not.toHaveBeenCalled();
        });
    });

    it('lists each food once in Food List, with the day’s portions added up', async () => {
        vi.mocked(getJournalEntries).mockResolvedValue([
            entry,
            {
                ...entry,
                id: '2',
                mealName: 'Apple crumble',
                ingredients: [{ ...entry.ingredients[0], weight: 50 }],
            },
        ]);
        render(<MyJournal />);
        await screen.findByRole('button', { name: 'Meal 2, Apple crumble' });
        fireEvent.click(screen.getByRole('tab', { name: 'Food List' }));

        const list = screen.getByRole('list', { name: 'Foods for the day' });
        const rows = within(list).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Apple');
        expect(rows[0]).toHaveTextContent('150 g');
        // Same calorie track as a recipe's Ingredients: 150 g × 52 kcal.
        expect(rows[0]).toHaveTextContent('78 kcal');
        expect(rows[1]).toHaveTextContent('Orange');
        expect(rows[1]).toHaveTextContent('200 g');
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

    it('opens the meal’s menu when a long press is let go without dragging', async () => {
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
            fireEvent.touchEnd(document);
            act(() => vi.advanceTimersByTime(220));
        } finally {
            vi.useRealTimers();
        }
        const menu = screen.getByRole('menu', { name: 'Fruit snack actions' });
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent),
            // On touch, hold and drag reorders, so there is no Move Up/Down.
        ).toEqual(['Edit', 'Delete']);
        expect(reorderJournalEntries).not.toHaveBeenCalled();
        // The release does not also open or close the meal.
        fireEvent.click(first);
        expect(first).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit' }));
        // Edit opens the meal straight into editing.
        expect(first).toHaveAttribute('aria-expanded', 'true');
        expect(
            screen.getByRole('spinbutton', { name: 'Apple weight in grams' }),
        ).toBeInTheDocument();
    });

    it('shows a hold building up and lifts on Android’s earlier long press', async () => {
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
        const card = first.closest('li')!;
        vi.useFakeTimers();
        try {
            fireEvent.pointerDown(first, {
                button: 0,
                pointerType: 'touch',
                clientX: 20,
                clientY: 20,
            });
            // The pressed meal is marked so CSS can show the hold working.
            expect(card).toHaveAttribute('data-pressing', 'true');
            // The system long press arrives before ours: lift now.
            act(() => {
                vi.advanceTimersByTime(300);
                fireEvent.contextMenu(first);
            });
            expect(card).not.toHaveAttribute('data-pressing');
            fireEvent.touchEnd(document);
            act(() => vi.advanceTimersByTime(220));
        } finally {
            vi.useRealTimers();
        }
        expect(
            screen.getByRole('menu', { name: 'Fruit snack actions' }),
        ).toBeInTheDocument();
    });

    it('clears the hold cue when the press ends early', async () => {
        render(<MyJournal />);
        const meal = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        fireEvent.pointerDown(meal, { button: 0, pointerType: 'touch' });
        fireEvent.pointerUp(meal, { pointerType: 'touch' });
        expect(meal.closest('li')).not.toHaveAttribute('data-pressing');
    });

    it('opens the menu on a long press when there is only one meal', async () => {
        render(<MyJournal />);
        const meal = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        vi.useFakeTimers();
        try {
            act(() => {
                fireEvent.pointerDown(meal, {
                    button: 0,
                    pointerType: 'touch',
                    clientX: 20,
                    clientY: 20,
                });
                vi.advanceTimersByTime(450);
            });
        } finally {
            vi.useRealTimers();
        }
        expect(
            within(screen.getByRole('menu', { name: 'Fruit snack actions' }))
                .getAllByRole('menuitem')
                .map((item) => item.textContent),
        ).toEqual(['Edit', 'Delete']);
    });

    it('opens the meal’s menu from a long press or right-click on its ingredients', async () => {
        render(<MyJournal />);
        const meal = await screen.findByRole('button', {
            name: 'Meal 1, Fruit snack',
        });
        fireEvent.click(meal);
        const ingredient = document.querySelector<HTMLElement>(
            '#journal-meal-1 .ingredient-section-row',
        )!;
        vi.useFakeTimers();
        try {
            act(() => {
                fireEvent.pointerDown(ingredient, {
                    button: 0,
                    pointerType: 'touch',
                    clientX: 40,
                    clientY: 300,
                });
                vi.advanceTimersByTime(450);
            });
        } finally {
            vi.useRealTimers();
        }
        const menu = screen.getByRole('menu', { name: 'Fruit snack actions' });
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent),
        ).toEqual(['Edit', 'Delete']);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        fireEvent.pointerDown(ingredient, { button: 2, pointerType: 'mouse' });
        fireEvent.contextMenu(ingredient, { clientX: 40, clientY: 300 });
        expect(
            screen.getByRole('menu', { name: 'Fruit snack actions' }),
        ).toBeInTheDocument();
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
        const heading = screen.getByRole('heading', { name: 'My Diary' });
        fireEvent.touchStart(heading, {
            touches: [{ clientX: 24, clientY: 80 }],
        });
        fireEvent.touchMove(heading, {
            touches: [{ clientX: 24, clientY: 220 }],
        });
        fireEvent.touchEnd(heading);
        expect(
            screen.getByRole('status', { name: 'Refreshing My Diary' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Fruit snack/ }),
        ).toBeInTheDocument();
        await act(async () => {
            finish([]);
        });
        expect(
            await screen.findByText('No meals in your diary for this day'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('status', { name: 'Refreshing My Diary' }),
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
        const heading = screen.getByRole('heading', { name: 'My Diary' });
        fireEvent.touchStart(heading, {
            touches: [{ clientX: 24, clientY: 80 }],
        });
        fireEvent.touchMove(heading, {
            touches: [{ clientX: 24, clientY: 220 }],
        });
        fireEvent.touchEnd(heading);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not refresh your diary',
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
            await screen.findByText('No meals in your diary for this day'),
        ).toBeInTheDocument();
        expect(
            screen
                .getByRole('group', { name: 'Daily nutrition summary' })
                .querySelector('.nutrition-overview-calories'),
        ).toHaveTextContent('0kcal');
    });
});

it('opens the meal page from View Details, not from its name', async () => {
    const onOpenMeal = vi.fn();
    render(<MyJournal onOpenMeal={onOpenMeal} />);
    const toggle = await screen.findByRole('button', {
        name: 'Meal 1, Fruit snack',
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The expanded name is not a link and shows no chevron.
    expect(
        screen.queryByRole('button', { name: 'Open Fruit snack recipe' }),
    ).not.toBeInTheDocument();
    expect(
        document.querySelector('.journal-meal-row .ingredient-name-chevron'),
    ).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(onOpenMeal).not.toHaveBeenCalled();

    fireEvent.contextMenu(toggle.closest('.journal-meal-row')!);
    const menu = screen.getByRole('menu', { name: 'Fruit snack actions' });
    expect(
        within(menu)
            .getAllByRole('menuitem')
            .map((item) => item.textContent),
    ).toEqual(['View Details', 'Edit', 'Delete']);
    fireEvent.click(
        within(menu).getByRole('menuitem', { name: 'View Details' }),
    );
    expect(onOpenMeal).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: '1', mealName: 'Fruit snack' }),
    );
});

it('renames a meal by tapping its name while editing', async () => {
    vi.mocked(updateJournalEntryIngredients).mockImplementation(
        async (id, ingredients) => ({ ...entry, id, ingredients }),
    );
    vi.mocked(updateJournalEntryName).mockImplementation(async (id, name) => ({
        ...entry,
        id,
        mealName: name,
    }));
    render(<MyJournal />);
    const toggle = await screen.findByRole('button', {
        name: 'Meal 1, Fruit snack',
    });
    // Not a rename target outside edit mode.
    expect(
        screen.queryByRole('button', { name: 'Rename Fruit snack' }),
    ).not.toBeInTheDocument();
    fireEvent.contextMenu(toggle.closest('.journal-meal-row')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    fireEvent.click(
        await screen.findByRole('button', { name: 'Rename Fruit snack' }),
    );
    const field = screen.getByRole('textbox', { name: 'Meal name' });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Fruit snack');
    // Esc puts the name back.
    fireEvent.change(field, { target: { value: 'Nope' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(
        screen.getByRole('button', { name: 'Rename Fruit snack' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Fruit snack' }));
    const again = screen.getByRole('textbox', { name: 'Meal name' });
    fireEvent.change(again, { target: { value: 'Morning\nfruit ' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(
        screen.getByRole('button', { name: 'Rename Morning fruit' }),
    ).toBeInTheDocument();
    expect(updateJournalEntryName).not.toHaveBeenCalled();

    // ✓ saves the name with the (unchanged) ingredients.
    fireEvent.click(
        screen.getByRole('button', { name: 'Save ingredients changes' }),
    );
    expect(
        await screen.findByRole('button', { name: 'Meal 1, Morning fruit' }),
    ).toBeInTheDocument();
    expect(updateJournalEntryName).toHaveBeenCalledExactlyOnceWith(
        '1',
        'Morning fruit',
        expect.anything(),
    );
});

it('drops a name change with ✕', async () => {
    render(<MyJournal />);
    const toggle = await screen.findByRole('button', {
        name: 'Meal 1, Fruit snack',
    });
    fireEvent.contextMenu(toggle.closest('.journal-meal-row')!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Rename Fruit snack' }),
    );
    const field = screen.getByRole('textbox', { name: 'Meal name' });
    fireEvent.change(field, { target: { value: 'Lunch' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.click(
        screen.getByRole('button', { name: 'Cancel ingredients changes' }),
    );
    expect(
        await screen.findByRole('button', { name: 'Meal 1, Fruit snack' }),
    ).toBeInTheDocument();
    expect(updateJournalEntryName).not.toHaveBeenCalled();
    // Undo brings the change back.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
        await screen.findByRole('button', { name: 'Rename Lunch' }),
    ).toBeInTheDocument();
});

it('offers Move Up and Move Down from right-click', async () => {
    vi.mocked(getJournalEntries).mockResolvedValue([
        entry,
        { ...entry, id: '2', mealName: 'Tofu bowl' },
    ]);
    render(<MyJournal />);
    const second = await screen.findByRole('button', {
        name: 'Meal 2, Tofu bowl',
    });
    fireEvent.contextMenu(second.closest('.journal-meal-row')!);
    expect(
        within(screen.getByRole('menu', { name: 'Tofu bowl actions' }))
            .getAllByRole('menuitem')
            .map((item) => item.textContent),
    ).toEqual(['Edit', 'Move Up', 'Delete']);
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
        editMeal('Fruit snack');
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
        // Editing has ended.
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Save ingredients changes',
                }),
            ).not.toBeInTheDocument(),
        );
    });

    it('keeps editing while scrolling or tapping inside the meal', async () => {
        await startAddingKiwi();
        tapOutside(60);
        const field = screen.getByRole('combobox', { name: 'Ingredient 3' });
        fireEvent.pointerDown(field);
        fireEvent.pointerUp(field);
        expect(updateJournalEntryIngredients).not.toHaveBeenCalled();
        expect(
            screen.getByRole('combobox', { name: 'Ingredient 3' }),
        ).toHaveValue('Kiwi');
    });

    it('hides Add ingredient and the total while typing, keeping Add meal still', async () => {
        await startAddingKiwi();
        expect(
            screen.queryByRole('button', { name: 'Add ingredient' }),
        ).not.toBeInTheDocument();
        // Add meal stays in the title row, so nothing appears or disappears.
        expect(screen.getByRole('button', { name: 'Add meal' })).toBeEnabled();

        fireEvent.keyDown(
            screen.getByRole('combobox', { name: 'Ingredient 3' }),
            { key: 'Enter' },
        );
        const weight = await screen.findByRole('spinbutton', {
            name: /Kiwi/,
        });
        fireEvent.focus(weight);
        expect(
            screen.queryByRole('button', { name: 'Add ingredient' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: 'Meal total' }),
        ).not.toBeInTheDocument();
        fireEvent.blur(weight);
        expect(
            screen.getByRole('button', { name: 'Add ingredient' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('group', { name: 'Meal total' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add meal' })).toBeEnabled();
    });

    it('shows Add ingredient on the next edit after saving mid-typing', async () => {
        await startAddingKiwi();
        fireEvent.keyDown(
            screen.getByRole('combobox', { name: 'Ingredient 3' }),
            { key: 'Enter' },
        );
        fireEvent.focus(
            await screen.findByRole('spinbutton', { name: /Kiwi/ }),
        );
        // Leaving the app saves; the focused field goes without a blur.
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });
        fireEvent(document, new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Save ingredients changes',
                }),
            ).not.toBeInTheDocument(),
        );
        editMeal('Fruit snack');
        expect(
            screen.getByRole('button', { name: 'Add ingredient' }),
        ).toBeInTheDocument();
    });

    it('re-creates a meal deleted elsewhere instead of losing the edit', async () => {
        vi.mocked(updateJournalEntryIngredients).mockRejectedValueOnce(
            new MissingJournalEntryError(),
        );
        vi.mocked(saveJournalEntry).mockImplementation(async (input) => ({
            ...input,
            id: 'again',
        }));
        await startAddingKiwi();
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(saveJournalEntry).toHaveBeenCalledExactlyOnceWith(
                {
                    eatenAt: entry.eatenAt,
                    mealName: 'Fruit snack',
                    ingredients: [
                        expect.objectContaining({ name: 'Apple' }),
                        expect.objectContaining({ name: 'Orange' }),
                        expect.objectContaining({ name: 'Kiwi' }),
                    ],
                },
                expect.anything(),
            ),
        );
        expect(
            await screen.findByText('Ingredients updated.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        // Later edits go to the re-created meal.
        editMeal('Fruit snack');
        fireEvent.change(
            screen.getByRole('spinbutton', { name: 'Kiwi weight in grams' }),
            { target: { value: '50' } },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        await waitFor(() =>
            expect(updateJournalEntryIngredients).toHaveBeenLastCalledWith(
                'again',
                expect.any(Array),
                expect.anything(),
            ),
        );
        expect(saveJournalEntry).toHaveBeenCalledOnce();
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
        editMeal('Fruit snack');
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
        ).toEqual([
            'Rename Fruit snack',
            'Cancel ingredients changes',
            'Save ingredients changes',
        ]);

        fireEvent.click(
            screen.getByRole('button', { name: 'Save ingredients changes' }),
        );
        // Back to the normal row, still open, with its collapse toggle.
        expect(
            await screen.findByRole('button', { name: 'Meal 1, Fruit snack' }),
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
