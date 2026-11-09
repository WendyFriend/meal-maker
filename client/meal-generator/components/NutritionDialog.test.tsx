import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type {
    IngredientInfo,
    UserIngredient,
} from '../../../shared/types/types';
import { IngredientCollectionContext } from '../../ingredients/IngredientCollectionContext';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import NutritionDialog from './NutritionDialog';
import IngredientNutritionSheet from './IngredientNutritionSheet';

vi.mock('../../hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: () => ({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    }),
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
    save.mockResolvedValue(undefined);
    mockPickerEnvironment();
});
afterEach(() => vi.unstubAllGlobals());

it('shows only an icon-only edit pencil in read mode', () => {
    render(<Fixture initiallySaved />);
    const edit = screen.getByRole('button', {
        name: 'Edit ingredient nutrition',
    });
    expect(edit).toHaveTextContent('');
    expect(edit.querySelector('svg')).not.toBeNull();
    expect(edit.closest('.sliding-sheet-header')).not.toBeNull();
    expect(
        screen.queryByRole('button', { name: /My Ingredients/ }),
    ).not.toBeInTheDocument();
});

it('keeps edits visible and reports an error when saving fails', async () => {
    onSave.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<Fixture initiallySaved />);
    await user.click(
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
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
        screen.queryByRole('button', { name: 'Edit ingredient nutrition' }),
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
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
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
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
    expect(
        screen.getByRole('spinbutton', { name: 'Calories per 100 grams' }),
    ).toHaveValue(34);
});

it('saves the edited values using the top-right tick', async () => {
    const user = userEvent.setup();
    render(<Fixture initiallySaved />);
    await user.click(
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
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
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
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
        screen.getByRole('button', { name: 'Edit ingredient nutrition' }),
    );
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
