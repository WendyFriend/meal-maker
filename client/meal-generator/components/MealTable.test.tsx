// import { render, screen } from '@testing-library/react';
// import userEvent from '@testing-library/user-event';
// import { describe, expect, it, vi } from 'vitest';
// import type { MealIngredient } from '../types';
// import MealTable from './MealTable';

// const ingredients: MealIngredient[] = [
//     {
//         name: 'Tofu',
//         amount: 100,
//         caloriesPer100g: 130,
//         proteinPer100g: 14,
//     },
//     {
//         name: 'Pumpkin',
//         amount: 200,
//         caloriesPer100g: 26,
//         proteinPer100g: 1,
//     },
// ];

// describe('MealTable', () => {
//     it('renders ingredients and their nutrition', () => {
//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={vi.fn()}
//                 isTotalUpdated={false}
//             />,
//         );

//         expect(screen.getByText('Tofu')).toBeInTheDocument();
//         expect(screen.getByText('Pumpkin')).toBeInTheDocument();

//         expect(screen.getByDisplayValue('100')).toBeInTheDocument();
//         expect(screen.getByDisplayValue('200')).toBeInTheDocument();

//         // Tofu: 100 / 100 * 130 = 130
//         expect(screen.getByText('130 kcal')).toBeInTheDocument();

//         // Pumpkin: 200 / 100 * 26 = 52
//         expect(screen.getByText('52 kcal')).toBeInTheDocument();

//         // Tofu: 100 / 100 * 14 = 14
//         expect(screen.getByText('14 g')).toBeInTheDocument();

//         // Pumpkin: 200 / 100 * 1 = 2
//         expect(screen.getByText('2 g')).toBeInTheDocument();
//     });

//     it('calculates total calories and protein', () => {
//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={vi.fn()}
//                 isTotalUpdated={false}
//             />,
//         );

//         // 130 + 52 = 182
//         expect(screen.getByText('182 kcal')).toBeInTheDocument();

//         // 14 + 2 = 16
//         expect(screen.getByText('16 g')).toBeInTheDocument();
//     });

//     it('calculates protein percentage', () => {
//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={vi.fn()}
//                 isTotalUpdated={false}
//             />,
//         );

//         // 16g protein * 4 / 182 kcal = 35.16%
//         expect(screen.getByText('35% of calories')).toBeInTheDocument();
//     });

//     it('calls onChange when an ingredient amount is changed', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();

//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={onChange}
//                 isTotalUpdated={false}
//             />,
//         );

//         const tofuInput = screen.getByDisplayValue('100');

//         await user.clear(tofuInput);
//         await user.type(tofuInput, '150');
//         await user.tab();

//         expect(onChange).toHaveBeenCalledWith([
//             {
//                 name: 'Tofu',
//                 amount: 150,
//                 caloriesPer100g: 130,
//                 proteinPer100g: 14,
//             },
//             {
//                 name: 'Pumpkin',
//                 amount: 200,
//                 caloriesPer100g: 26,
//                 proteinPer100g: 1,
//             },
//         ]);
//     });

//     it('calls onChange when Enter is pressed after changing an amount', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();

//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={onChange}
//                 isTotalUpdated={false}
//             />,
//         );

//         const tofuInput = screen.getByDisplayValue('100');

//         await user.clear(tofuInput);
//         await user.type(tofuInput, '150');
//         await user.keyboard('{Enter}');

//         expect(onChange).toHaveBeenCalledWith([
//             {
//                 name: 'Tofu',
//                 amount: 150,
//                 caloriesPer100g: 130,
//                 proteinPer100g: 14,
//             },
//             {
//                 name: 'Pumpkin',
//                 amount: 200,
//                 caloriesPer100g: 26,
//                 proteinPer100g: 1,
//             },
//         ]);
//     });

//     it('restores the previous amount when an invalid amount is entered', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();

//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={onChange}
//                 isTotalUpdated={false}
//             />,
//         );

//         const tofuInput = screen.getByDisplayValue('100');

//         await user.clear(tofuInput);
//         await user.type(tofuInput, '-10');
//         await user.tab();

//         expect(onChange).not.toHaveBeenCalled();
//         expect(screen.getByDisplayValue('100')).toBeInTheDocument();
//     });

//     it('highlights totals when they have been updated', () => {
//         const { container } = render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={vi.fn()}
//                 isTotalUpdated={true}
//             />,
//         );

//         const updatedTotals = container.querySelectorAll(
//             '.total-value-updated',
//         );

//         expect(updatedTotals).toHaveLength(2);
//     });

//     it('does not highlight totals when they have not been updated', () => {
//         const { container } = render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={vi.fn()}
//                 isTotalUpdated={false}
//             />,
//         );

//         const updatedTotals = container.querySelectorAll(
//             '.total-value-updated',
//         );

//         expect(updatedTotals).toHaveLength(0);
//     });

//     it('does not call onChange when amount is unchanged', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={onChange}
//                 isTotalUpdated={false}
//             />,
//         );
//         const amountInput = screen.getByDisplayValue('100');
//         await user.click(amountInput);
//         await user.tab();
//         expect(onChange).not.toHaveBeenCalled();
//     });

//     it('calls onChange when amount is changed', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(
//             <MealTable
//                 ingredients={ingredients}
//                 onChange={onChange}
//                 isTotalUpdated={false}
//             />,
//         );
//         const amountInput = screen.getByDisplayValue('100');
//         await user.clear(amountInput);
//         await user.type(amountInput, '200');
//         await user.tab();
//         expect(onChange).toHaveBeenCalledTimes(1);
//         expect(onChange).toHaveBeenCalledWith([
//             {
//                 name: 'Tofu',
//                 amount: 200,
//                 caloriesPer100g: 130,
//                 proteinPer100g: 14,
//             },
//             {
//                 name: 'Pumpkin',
//                 amount: 200,
//                 caloriesPer100g: 26,
//                 proteinPer100g: 1,
//             },
//         ]);
//     });
// });
