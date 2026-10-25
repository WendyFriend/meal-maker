import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UserIngredient } from '../../../shared/types/types';
import NutritionDialog from './NutritionDialog';

const rice: UserIngredient = {
    ingredientId: 'r1',
    name: 'Rice',
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbohydratePer100g: 28,
    fatPer100g: 0.3,
    quantity: 500,
    unit: 'g',
    expiresOn: '2026-11-01',
};

describe('NutritionDialog on-hand section', () => {
    it('is hidden unless showPantry is set, and leaves pantry data untouched', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn(async () => {});
        render(
            <NutritionDialog
                ingredientInfo={rice}
                onClose={vi.fn()}
                onSave={onSave}
            />,
        );
        expect(screen.queryByLabelText('Quantity')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Done' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ quantity: 500, expiresOn: '2026-11-01' }),
            true,
        );
    });

    it('edits and clears on-hand details when enabled', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn(async () => {});
        render(
            <NutritionDialog
                ingredientInfo={rice}
                onClose={vi.fn()}
                onSave={onSave}
                showPantry
            />,
        );
        const quantity = screen.getByLabelText('Quantity');
        expect(quantity).toHaveValue(500);
        await user.clear(quantity);
        await user.type(quantity, '250');
        await user.selectOptions(screen.getByLabelText('Unit'), 'ml');
        await user.click(screen.getByRole('button', { name: 'Clear' }));
        await user.click(screen.getByRole('button', { name: 'Done' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                quantity: 250,
                unit: 'ml',
                expiresOn: undefined,
            }),
            true,
        );
    });
});
