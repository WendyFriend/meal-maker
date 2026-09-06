import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import IngredientInput from './IngredientInput';

describe('IngredientInput', () => {
    it('adds an ingredient when Enter is pressed', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <IngredientInput
                ingredients={[{ name: 'Tofu' }]}
                onChange={onChange}
            />,
        );
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.type(input, 'Kale');
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith([
            { name: 'Tofu' },
            { name: 'Kale' },
        ]);
    });

    it('clears the input after adding an ingredient', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<IngredientInput ingredients={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.type(input, 'Kale');
        await user.keyboard('{Enter}');
        expect(input).toHaveValue('');
    });

    it('keeps focus on the input after adding an ingredient', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<IngredientInput ingredients={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.type(input, 'Kale');
        await user.keyboard('{Enter}');
        expect(input).toHaveFocus();
    });

    it('does not add an ingredient when the input is empty', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<IngredientInput ingredients={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.click(input);
        await user.keyboard('{Enter}');
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveFocus();
    });

    it('does not add a duplicate ingredient', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <IngredientInput
                ingredients={[{ name: 'Tofu' }, { name: 'Kale' }]}
                onChange={onChange}
            />,
        );
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.type(input, 'Kale');
        await user.keyboard('{Enter}');
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveValue('');
        expect(input).toHaveFocus();
    });

    it('trims whitespace from an ingredient', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<IngredientInput ingredients={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.type(input, ' Kale ');
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith([{ name: 'Kale' }]);
    });

    it('does not add an ingredient when a non-Enter key is pressed', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<IngredientInput ingredients={[]} onChange={onChange} />);
        const input = screen.getByPlaceholderText('Add an ingredient...');
        await user.type(input, 'Kale');
        await user.keyboard('{Space}');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('removes an ingredient when the remove button is clicked', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <IngredientInput
                ingredients={[{ name: 'Tofu' }, { name: 'Kale' }]}
                onChange={onChange}
            />,
        );
        const removeKaleButton = screen.getByRole('button', {
            name: 'Remove Kale',
        });
        await user.click(removeKaleButton);
        expect(onChange).toHaveBeenCalledWith([{ name: 'Tofu' }]);
    });

    it('opens the nutrition dialog when an ingredient chip is clicked', async () => {
        const user = userEvent.setup();
        render(
            <IngredientInput
                ingredients={[{ name: 'Tofu' }]}
                onChange={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Edit nutrition for Tofu' }),
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Nutrition per 100 g')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Save to Ingredients'),
        ).toBeInTheDocument();
    });

    it('updates an ingredient name when its edit field loses focus', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <IngredientInput
                ingredients={[{ name: 'Tofu' }]}
                onChange={onChange}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Edit nutrition for Tofu' }),
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

        expect(onChange).toHaveBeenCalledWith([{ name: 'Smoked tofu' }]);
    });
});
