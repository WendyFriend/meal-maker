// import { render, screen } from '@testing-library/react';
// import userEvent from '@testing-library/user-event';
// import { describe, expect, it, vi } from 'vitest';
// import IngredientInput from './IngredientInput';

// describe('IngredientInput', () => {
//     it('adds an ingredient when Enter is pressed', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(
//             <IngredientInput
//                 ingredients={[{ name: 'Tofu' }]}
//                 onChange={onChange}
//             />,
//         );
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.type(input, 'Kale');
//         await user.keyboard('{Enter}');
//         expect(onChange).toHaveBeenCalledWith([
//             { name: 'Tofu' },
//             { name: 'Kale' },
//         ]);
//     });

//     it('clears the input after adding an ingredient', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(<IngredientInput ingredients={[]} onChange={onChange} />);
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.type(input, 'Kale');
//         await user.keyboard('{Enter}');
//         expect(input).toHaveValue('');
//     });

//     it('keeps focus on the input after adding an ingredient', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(<IngredientInput ingredients={[]} onChange={onChange} />);
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.type(input, 'Kale');
//         await user.keyboard('{Enter}');
//         expect(input).toHaveFocus();
//     });

//     it('does not add an ingredient when the input is empty', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(<IngredientInput ingredients={[]} onChange={onChange} />);
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.click(input);
//         await user.keyboard('{Enter}');
//         expect(onChange).not.toHaveBeenCalled();
//         expect(input).toHaveFocus();
//     });

//     it('does not add a duplicate ingredient', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(
//             <IngredientInput
//                 ingredients={[{ name: 'Tofu' }, { name: 'Kale' }]}
//                 onChange={onChange}
//             />,
//         );
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.type(input, 'Kale');
//         await user.keyboard('{Enter}');
//         expect(onChange).not.toHaveBeenCalled();
//         expect(input).toHaveValue('');
//         expect(input).toHaveFocus();
//     });

//     it('trims whitespace from an ingredient', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(<IngredientInput ingredients={[]} onChange={onChange} />);
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.type(input, ' Kale ');
//         await user.keyboard('{Enter}');
//         expect(onChange).toHaveBeenCalledWith([{ name: 'Kale' }]);
//     });

//     it('does not add an ingredient when a non-Enter key is pressed', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(<IngredientInput ingredients={[]} onChange={onChange} />);
//         const input = screen.getByPlaceholderText('Add an ingredient...');
//         await user.type(input, 'Kale');
//         await user.keyboard('{Space}');
//         expect(onChange).not.toHaveBeenCalled();
//     });

//     it('removes an ingredient when the remove button is clicked', async () => {
//         const user = userEvent.setup();
//         const onChange = vi.fn();
//         render(
//             <IngredientInput
//                 ingredients={[{ name: 'Tofu' }, { name: 'Kale' }]}
//                 onChange={onChange}
//             />,
//         );
//         const removeKaleButton = screen.getByRole('button', {
//             name: 'Remove Kale',
//         });
//         await user.click(removeKaleButton);
//         expect(onChange).toHaveBeenCalledWith([{ name: 'Tofu' }]);
//     });
// });
