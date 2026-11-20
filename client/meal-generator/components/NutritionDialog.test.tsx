import { fixMenuOption } from '../../test/fixMenu';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type {
    NutritionLabelScan,
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import { IngredientCollectionContext } from '../../ingredients/IngredientCollectionContext';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import NutritionDialog from './NutritionDialog';
import IngredientNutritionSheet from './IngredientNutritionSheet';
import {
    identifyFoodPhoto,
    scanNutritionLabel,
} from '../../services/nutritionPhotoService';
import { searchNutritionLabFoods } from '../../services/foodSearchService';

const lookup = vi.hoisted(() => ({
    data: {} as Record<
        string,
        import('../../../shared/types/types').IngredientInfo
    >,
}));
vi.mock('../../hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: lookup.data,
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
}));
vi.mock('../../services/foodSearchService', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../../services/foodSearchService')
    >()),
    searchNutritionLabFoods: vi.fn(),
}));
vi.mock('../../services/nutritionPhotoService', () => ({
    scanNutritionLabel: vi.fn(),
    identifyFoodPhoto: vi.fn(),
}));
vi.mock('../../components/IngredientCamera', () => ({
    default: ({ onContinue }: { onContinue: (photo: string) => void }) => (
        <button
            type="button"
            onClick={() => onContinue('data:image/jpeg;base64,x')}
        >
            Use test photo
        </button>
    ),
}));
const ingredient = {
    name: 'Broccoli',
    caloriesPer100g: 34,
    proteinPer100g: 2.8,
    carbohydratePer100g: 6.6,
    fatPer100g: 0.4,
};
const saved = { ...ingredient, ingredientId: 'broccoli-id' };
const save = vi.fn<(ingredient: IngredientInfo) => Promise<void>>();
const onSave = vi.fn().mockResolvedValue(undefined);
const onClose = vi.fn();

function Fixture({
    initiallySaved = false,
    resultSheet = false,
}: {
    initiallySaved?: boolean;
    resultSheet?: boolean;
}) {
    const [ingredients, setIngredients] = useState<UserIngredient[]>(
        initiallySaved ? [saved] : [],
    );
    return (
        <IngredientCollectionContext
            value={{
                ingredients,
                save: async (updated) => {
                    await save(updated);
                    setIngredients([{ ...saved, ...updated }]);
                },
            }}
        >
            {resultSheet ? (
                <IngredientNutritionSheet
                    ingredient={ingredient}
                    onClose={onClose}
                />
            ) : (
                <NutritionDialog
                    ingredientInfo={ingredient}
                    onClose={onClose}
                    onSave={onSave}
                />
            )}
        </IngredientCollectionContext>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    lookup.data = {};
    save.mockResolvedValue(undefined);
    mockPickerEnvironment();
});
afterEach(() => vi.unstubAllGlobals());

it('offers every fix from a menu under the ingredient name', async () => {
    const user = userEvent.setup();
    render(<Fixture initiallySaved />);
    const fix = screen.getByRole('button', { name: 'Doesn’t look right?' });
    expect(fix.closest('.sliding-sheet-header')).toBeNull();
    expect(fix.closest('.ingredient-nutrition-title')).not.toBeNull();
    expect(
        screen.queryByRole('button', { name: /Edit ingredient/ }),
    ).not.toBeInTheDocument();
    // A light-dismiss popover, shared with the micronutrient details.
    const menu = document.getElementById(fix.getAttribute('popovertarget')!)!;
    expect(menu).toHaveAttribute('popover', 'auto');
    expect(menu).toHaveClass('popover-panel', 'nutrition-fix-menu');
    // A small ? beside the name, with a tooltip, opens it.
    expect(fix).toHaveTextContent('');
    expect(fix).toHaveAttribute('title', 'Doesn’t look right?');
    expect(fix.closest('.ingredient-nutrition-name-row')).not.toBeNull();
    expect(menu).toHaveTextContent(/^Doesn’t look right\?/);
    expect(
        within(menu)
            .getAllByRole('button', { hidden: true })
            .map((button) => button.textContent),
    ).toEqual([
        'Search from database',
        'Scan nutrition label',
        'Take a photo',
        'Correct the numbers',
    ]);
    await user.click(fix);
    await user.click(
        within(menu).getByRole('button', {
            name: 'Correct the numbers',
            hidden: true,
        }),
    );
    // The links keep their space while editing, so nothing moves, and no
    // hint is added above the values.
    expect(
        screen.queryByRole('button', { name: 'Doesn’t look right?' }),
    ).not.toBeInTheDocument();
    expect(
        document.querySelectorAll('.nutrition-fix-placeholder'),
    ).toHaveLength(2);
    expect(document.querySelector('.label-scan')).toBeNull();
    expect(screen.queryByText(/Enter amounts per 100 g/)).toBeNull();
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(34);
});

it('offers the same menu under Vitamins & minerals', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const bottom = screen.getByRole('button', {
        name: 'The numbers don’t look right?',
    });
    expect(
        bottom.closest('section[aria-label="Micronutrients"]'),
    ).not.toBeNull();
    const menu = document.getElementById(
        bottom.getAttribute('popovertarget')!,
    )!;
    expect(
        within(menu)
            .getAllByRole('button', { hidden: true })
            .map((button) => button.textContent),
    ).toEqual([
        'Search from database',
        'Scan nutrition label',
        'Take a photo',
        'Correct the numbers',
    ]);
    expect(menu).not.toHaveTextContent('Doesn’t look right?');
    await user.click(bottom);
    await user.click(
        fixMenuOption('Correct the numbers', 'The numbers don’t look right?'),
    );
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toBeInTheDocument();
});

it('edits vitamins and minerals with the other numbers', async () => {
    const user = userEvent.setup();
    render(
        <NutritionDialog
            ingredientInfo={{
                ...ingredient,
                ironPer100g: 0.7,
                zincPer100g: 0.4,
            }}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    const iron = screen.getByRole('spinbutton', { name: /^Iron per 100 g/ });
    expect(iron).toHaveValue(0.7);
    await user.clear(iron);
    await user.type(iron, '1.1');
    await user.type(
        screen.getByRole('spinbutton', { name: /^Calcium per 100 g/ }),
        '47',
    );
    await user.clear(
        screen.getByRole('spinbutton', { name: /^Zinc per 100 g/ }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({
        ironPer100g: 1.1,
        calciumPer100g: 47,
        caloriesPer100g: 34,
    });
    // A cleared amount stays unavailable instead of being looked up again.
    expect(saved.zincPer100g).toBeUndefined();
    expect(saved.unavailableMicronutrients).toEqual(['zincPer100g']);
});

it('keeps edits visible and reports an error when saving fails', async () => {
    onSave.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<Fixture initiallySaved />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save your changes',
    );
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
});

it('keeps the meal-result ingredient sheet read-only', () => {
    render(<Fixture initiallySaved resultSheet />);
    expect(
        screen
            .getByRole('button', { name: 'Close sheet' })
            .closest('.sliding-sheet-header'),
    ).not.toBeNull();
    expect(
        screen.queryByRole('button', { name: 'Doesn’t look right?' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Calories/ })).toHaveTextContent(
        '34',
    );
    expect(save).not.toHaveBeenCalled();
});

it('closes without writing changes when the handle is clicked', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(save).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
});

it('cancels editing from the top-left cross and restores the original values', async () => {
    const user = userEvent.setup();
    render(<Fixture initiallySaved />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    expect(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    ).toBeVisible();
    expect(
        screen
            .getByRole('button', { name: 'Save ingredient changes' })
            .closest('.sliding-sheet-header'),
    ).not.toBeNull();
    expect(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    ).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    const calories = screen.getByRole('spinbutton', {
        name: 'Calories per 100 grams',
    });
    await user.clear(calories);
    await user.type(calories, '80');
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.getByRole('heading', { name: 'Broccoli' })).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(34);
});

it('saves the edited values using the top-right tick', async () => {
    const user = userEvent.setup();
    render(<Fixture initiallySaved />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    expect(onSave).not.toHaveBeenCalled();
    const calories = screen.getByRole('spinbutton', {
        name: 'Calories per 100 grams',
    });
    await user.clear(calories);
    await user.type(calories, '80');
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
            ingredientId: saved.ingredientId,
            caloriesPer100g: 80,
        }),
        true,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Calories/ })).toHaveTextContent(
        '80',
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    const savedCalories = screen.getByRole('spinbutton', {
        name: 'Calories per 100 grams',
    });
    expect(savedCalories).toHaveValue(80);
    await user.clear(savedCalories);
    await user.type(savedCalories, '90');
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.getByRole('row', { name: /Calories/ })).toHaveTextContent(
        '80',
    );
});

it('validates required fields when the header tick is clicked', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    await user.clear(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    );
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toBeInvalid();
});

it('fills values from a scanned label for review before saving', async () => {
    let finish!: (scan: NutritionLabelScan) => void;
    vi.mocked(scanNutritionLabel).mockReturnValue(
        new Promise((resolve) => (finish = resolve)),
    );
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Scan nutrition label'));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));
    // A spinner covers the numbers, which can't be edited meanwhile.
    expect(screen.getByRole('status')).toHaveTextContent('Reading label…');
    expect(
        document.querySelector('.ingredient-nutrition-numbers'),
    ).toHaveAttribute('inert');
    expect(
        screen.queryByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toBeNull();
    // The food's name helps Nutrition Lab read the label.
    expect(scanNutritionLabel).toHaveBeenCalledWith(
        'data:image/jpeg;base64,x',
        'Broccoli',
    );
    await act(async () =>
        finish({
            nutrition: {
                caloriesPer100g: 380,
                proteinPer100g: 13.5,
                calciumPer100g: 120,
            },
            basis: '100g',
            warnings: ['Energy doesn’t match the macros.'],
        }),
    );
    // Confirmed by a toast, with what to check.
    const toast = document.querySelector('.nutrition-sheet-toast')!;
    expect(toast).toHaveTextContent('Label Scanned.');
    expect(toast).toHaveTextContent('Energy doesn’t match the macros.');
    expect(screen.queryByRole('button', { name: 'Scan again' })).toBeNull();
    // The ? stays beside the name to scan again.
    expect(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    ).toBeEnabled();
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(380);
    expect(
        screen.getByRole('spinbutton', { name: 'Calcium per 100 g (mg)' }),
    ).toHaveValue(120);
    // Values the label did not show are kept.
    expect(
        screen.getByRole('spinbutton', { name: 'Total fat per 100 grams' }),
    ).toHaveValue(0.4);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(
        screen.getByRole('button', { name: 'Save ingredient changes' }),
    );
    expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
            caloriesPer100g: 380,
            proteinPer100g: 13.5,
            fatPer100g: 0.4,
            calciumPer100g: 120,
        }),
        false,
    );
});

it('saves scanned values when the sheet is closed', async () => {
    vi.mocked(scanNutritionLabel).mockResolvedValue({
        nutrition: { caloriesPer100g: 380 },
        basis: '100g',
        warnings: [],
    });
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Scan nutrition label'));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));
    await screen.findByText('Label Scanned.');
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ caloriesPer100g: 380, fatPer100g: 0.4 }),
        false,
    );
});

it('closes an unchanged form without saving', async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    await user.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).not.toHaveBeenCalled();
});

it('explains a failed scan in place of the numbers, with ways forward', async () => {
    vi.mocked(scanNutritionLabel).mockRejectedValue(
        new Error('Could not read this label. Try a closer, well-lit photo.'),
    );
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Scan nutrition label'));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not read this label');
    const panel = alert.closest('.label-scan-failed') as HTMLElement;
    expect(
        within(panel)
            .getAllByRole('button')
            .map((button) => button.textContent),
    ).toEqual([
        'Search from database',
        'Scan nutrition label',
        'Take a photo',
        'Correct the numbers',
    ]);
    // The numbers stay hidden, and nothing is being edited.
    expect(
        document.querySelector('.ingredient-nutrition-numbers'),
    ).toHaveAttribute('inert');
    expect(
        screen.queryByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toBeNull();
    // Correct the numbers brings them back, filled as before.
    await user.click(
        within(panel).getByRole('button', { name: 'Correct the numbers' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(34);
});

const redRice = {
    name: 'red rice',
    resolvedName: 'White rice, cooked',
    nutritionSource: { fdcId: 1, description: 'Rice, white, cooked' },
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbohydratePer100g: 28,
    fatPer100g: 0.3,
    calciumPer100g: 10,
};

it('titles the sheet with the matched food from the database', () => {
    render(
        <NutritionDialog
            ingredientInfo={redRice}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    expect(
        screen.getByRole('heading', { name: 'White rice, cooked' }),
    ).toBeInTheDocument();
});

it('replaces a wrong match with a food picked from search', async () => {
    vi.mocked(searchNutritionLabFoods).mockResolvedValue([
        {
            fdcId: 1,
            name: 'White rice, cooked',
            description: 'Rice, white, cooked',
            per100g: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
        },
        {
            fdcId: 2,
            name: 'Red rice, cooked',
            description: 'Rice, red, cooked',
            per100g: {
                kcal: 111,
                proteinG: 2.6,
                carbsG: 23,
                fatG: 0.9,
                fibreG: 1.8,
            },
        },
        {
            fdcId: 3,
            name: 'Red rice flour',
            description: 'Rice flour, red',
            per100g: { kcal: null, proteinG: 6, carbsG: 80, fatG: 1 },
        },
    ]);
    const user = userEvent.setup();
    render(
        <NutritionDialog
            ingredientInfo={redRice}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Search from database'));
    expect(screen.getByRole('searchbox', { name: 'Search foods' })).toHaveValue(
        'red rice',
    );
    const current = await screen.findByRole('button', {
        name: /White rice, cooked/,
    });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(
        screen.getByRole('button', { name: /Red rice flour/ }),
    ).toBeDisabled();
    expect(searchNutritionLabFoods).toHaveBeenCalledWith(
        'red rice',
        expect.any(AbortSignal),
    );
    await user.click(screen.getByRole('button', { name: /Red rice, cooked/ }));
    expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
            name: 'red rice',
            resolvedName: 'Red rice, cooked',
            nutritionSource: { fdcId: 2, description: 'Rice, red, cooked' },
            caloriesPer100g: 111,
            fiberPer100g: 1.8,
            unavailableMicronutrients: expect.arrayContaining([
                'calciumPer100g',
            ]),
        }),
        false,
    );
    // The old match's micronutrients are not carried over.
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('calciumPer100g');
    expect(await screen.findByRole('status')).toHaveTextContent(
        'Now using nutrition for Red rice, cooked.',
    );
    expect(
        screen.getByRole('heading', { name: 'Red rice, cooked' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Calories/ })).toHaveTextContent(
        '111',
    );
});

it('returns to the nutrition from the food picker without changes', async () => {
    vi.mocked(searchNutritionLabFoods).mockResolvedValue([]);
    const user = userEvent.setup();
    render(
        <NutritionDialog
            ingredientInfo={redRice}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Search from database'));
    expect(
        await screen.findByText('No foods found. Try a different name.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to nutrition' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
        screen.getByRole('heading', { name: 'White rice, cooked' }),
    ).toBeInTheDocument();
});

it('searches for the food named in a photo', async () => {
    vi.mocked(identifyFoodPhoto).mockResolvedValue('red rice cooked');
    vi.mocked(searchNutritionLabFoods).mockResolvedValue([]);
    const user = userEvent.setup();
    render(
        <NutritionDialog
            ingredientInfo={redRice}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Take a photo'));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));
    expect(
        await screen.findByRole('searchbox', { name: 'Search foods' }),
    ).toHaveValue('red rice cooked');
    expect(screen.getByText('Looks like “red rice cooked”.')).toBeVisible();
    expect(identifyFoodPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,x');
});

it('falls back to searching the typed name when a photo is not recognised', async () => {
    vi.mocked(identifyFoodPhoto).mockRejectedValue(
        new Error('Couldn’t recognise the food. Search for it instead.'),
    );
    vi.mocked(searchNutritionLabFoods).mockResolvedValue([]);
    const user = userEvent.setup();
    render(
        <NutritionDialog
            ingredientInfo={redRice}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Take a photo'));
    await user.click(screen.getByRole('button', { name: 'Use test photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t recognise the food',
    );
    expect(screen.getByRole('searchbox', { name: 'Search foods' })).toHaveValue(
        'red rice',
    );
});

it('fills the number fields with nutrition that arrived after the sheet opened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
        <NutritionDialog
            ingredientInfo={{ name: 'Broccoli' }}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    // The meal's background lookup finishes while the sheet is open.
    rerender(
        <NutritionDialog
            ingredientInfo={{ ...ingredient, ironPer100g: 0.7 }}
            onClose={onClose}
            onSave={onSave}
        />,
    );
    expect(screen.getByRole('row', { name: /Calories/ })).toHaveTextContent(
        '34',
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(34);
    expect(
        screen.getByRole('spinbutton', { name: /^Iron per 100 g/ }),
    ).toHaveValue(0.7);
});

it('keeps typed numbers when a reference lookup arrives while editing', async () => {
    const user = userEvent.setup();
    const props = { onClose, onSave } as const;
    const { rerender } = render(
        <NutritionDialog ingredientInfo={ingredient} {...props} />,
    );
    await user.click(
        screen.getByRole('button', { name: 'Doesn’t look right?' }),
    );
    await user.click(fixMenuOption('Correct the numbers'));
    const calories = screen.getByRole('spinbutton', {
        name: 'Calories per 100 grams',
    });
    await user.clear(calories);
    await user.type(calories, '99');
    // The micronutrient lookup for this ingredient finishes now.
    lookup.data = {
        broccoli: {
            name: 'Broccoli, raw',
            caloriesPer100g: 34,
            ironPer100g: 0.7,
        },
    };
    rerender(<NutritionDialog ingredientInfo={{ ...ingredient }} {...props} />);
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(99);
});
