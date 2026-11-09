import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';
import SelectedIngredients from './SelectedIngredients';

afterEach(() => vi.unstubAllGlobals());

it('shows an accessible clear icon in the chip area without a heading row', async () => {
    const onClear = vi.fn();
    render(
        <SelectedIngredients
            ingredients={['Spinach', 'Tofu']}
            removeIngredient={vi.fn()}
            onIngredientClick={vi.fn()}
            onClear={onClear}
        />,
    );
    expect(
        screen.queryByRole('heading', { name: /Selected ingredients/ }),
    ).not.toBeInTheDocument();
    const chips = screen.getByRole('group', {
        name: 'Selected ingredient list',
    });
    const clearButton = within(chips).getByRole('button', {
        name: 'Clear all selected ingredients',
    });
    expect(clearButton).toHaveTextContent('×');
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    await userEvent.setup().click(clearButton);
    expect(onClear).toHaveBeenCalledOnce();
});

it('removes a chip immediately when reduced motion is preferred', async () => {
    mockPickerEnvironment();
    vi.mocked(window.matchMedia).mockReturnValue({
        ...window.matchMedia(''),
        matches: true,
    });
    const remove = vi.fn();
    render(
        <SelectedIngredients
            ingredients={['Spinach']}
            removeIngredient={remove}
            onIngredientClick={vi.fn()}
            onClear={vi.fn()}
        />,
    );
    await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Remove Spinach' }));
    expect(remove).toHaveBeenCalledWith('Spinach');
    expect(
        document.querySelector('.ingredient-chip-wrapper-deleting'),
    ).toBeNull();
});

it('reveals newly added chips without scrolling on removal or ordinary rerenders', () => {
    const props = {
        removeIngredient: vi.fn(),
        onIngredientClick: vi.fn(),
        onClear: vi.fn(),
    };
    const { rerender } = render(
        <SelectedIngredients {...props} ingredients={['Spinach']} />,
    );
    const list = screen.getByRole('group', {
        name: 'Selected ingredient list',
    });
    Object.defineProperty(list, 'scrollHeight', {
        value: 500,
        configurable: true,
    });
    rerender(
        <SelectedIngredients {...props} ingredients={['Spinach', 'Tofu']} />,
    );
    expect(list.scrollTop).toBe(500);
    list.scrollTop = 40;
    rerender(
        <SelectedIngredients {...props} ingredients={['Spinach', 'Tofu']} />,
    );
    expect(list.scrollTop).toBe(40);
    rerender(<SelectedIngredients {...props} ingredients={['Spinach']} />);
    expect(list.scrollTop).toBe(40);
});
