import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import NutritionTable from './NutritionTable';
import type { MealIngredient } from '../types';

const ingredients: MealIngredient[] = [
    {
        name: 'Tofu',
        amount: 150,
        caloriesPer100g: 130,
        proteinPer100g: 14,
    },
    {
        name: 'Kale',
        amount: 100,
        caloriesPer100g: 35,
        proteinPer100g: 3,
    },
];

describe('NutritionTable', () => {
    it('renders ingredients and nutrition values', () => {
        render(<NutritionTable ingredients={ingredients} onChange={vi.fn()} />);

        expect(screen.getByText('Tofu')).toBeInTheDocument();
        expect(screen.getByText('Kale')).toBeInTheDocument();

        const inputs = screen.getAllByRole('textbox');

        expect(inputs[0]).toHaveValue('130');
        expect(inputs[1]).toHaveValue('14');
        expect(inputs[2]).toHaveValue('35');
        expect(inputs[3]).toHaveValue('3');
    });

    it('calls onChange when calories are changed', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        render(
            <NutritionTable ingredients={ingredients} onChange={onChange} />,
        );

        const inputs = screen.getAllByRole('textbox');

        await user.clear(inputs[0]);
        await user.type(inputs[0], '140');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith([
            {
                name: 'Tofu',
                amount: 150,
                caloriesPer100g: 140,
                proteinPer100g: 14,
            },
            {
                name: 'Kale',
                amount: 100,
                caloriesPer100g: 35,
                proteinPer100g: 3,
            },
        ]);
    });

    it('calls onChange when protein is changed', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        render(
            <NutritionTable ingredients={ingredients} onChange={onChange} />,
        );

        const inputs = screen.getAllByRole('textbox');

        await user.clear(inputs[1]);
        await user.type(inputs[1], '15');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith([
            {
                name: 'Tofu',
                amount: 150,
                caloriesPer100g: 130,
                proteinPer100g: 15,
            },
            {
                name: 'Kale',
                amount: 100,
                caloriesPer100g: 35,
                proteinPer100g: 3,
            },
        ]);
    });

    it('restores the previous value when an invalid value is entered', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        render(
            <NutritionTable ingredients={ingredients} onChange={onChange} />,
        );

        const inputs = screen.getAllByRole('textbox');

        await user.clear(inputs[0]);
        await user.type(inputs[0], '-10');
        await user.tab();

        expect(inputs[0]).toHaveValue('130');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('commits the value when Enter is pressed', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        render(
            <NutritionTable ingredients={ingredients} onChange={onChange} />,
        );

        const inputs = screen.getAllByRole('textbox');

        await user.clear(inputs[0]);
        await user.type(inputs[0], '140');
        await user.keyboard('{Enter}');

        expect(onChange).toHaveBeenCalledWith([
            {
                name: 'Tofu',
                amount: 150,
                caloriesPer100g: 140,
                proteinPer100g: 14,
            },
            {
                name: 'Kale',
                amount: 100,
                caloriesPer100g: 35,
                proteinPer100g: 3,
            },
        ]);
    });
});
