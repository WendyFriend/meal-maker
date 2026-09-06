import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NutritionDialog from './NutritionDialog';

const tofu = { name: 'Tofu' };

describe('NutritionDialog', () => {
    it('renders the nutrition fields and save option', () => {
        render(
            <NutritionDialog
                ingredient={tofu}
                isSaved={false}
                onClose={vi.fn()}
                onIngredientNameChange={vi.fn()}
                onDone={vi.fn()}
            />,
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Nutrition per 100 g')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Save to Ingredients'),
        ).toBeInTheDocument();
    });

    it('saves an edited ingredient name when its field loses focus', async () => {
        const user = userEvent.setup();
        const onIngredientNameChange = vi.fn();
        render(
            <NutritionDialog
                ingredient={tofu}
                isSaved={false}
                onClose={vi.fn()}
                onIngredientNameChange={onIngredientNameChange}
                onDone={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Edit ingredient name, Tofu' }),
        );
        await user.clear(screen.getByLabelText('Ingredient name'));
        await user.type(
            screen.getByLabelText('Ingredient name'),
            'Smoked tofu',
        );
        await user.tab();

        expect(onIngredientNameChange).toHaveBeenCalledWith({
            name: 'Smoked tofu',
        });
    });
});
