import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import IngredientInput from './IngredientInput';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';

beforeEach(() => mockPickerEnvironment());
afterEach(() => vi.unstubAllGlobals());

it('shows and closes the voice and image coming soon dialogs', async () => {
    const user = userEvent.setup();
    render(
        <IngredientInput
            ingredients={[]}
            savedIngredients={[]}
            onChange={vi.fn()}
        />,
    );

    const voice = screen.getByRole('button', { name: 'Voice' });
    await user.click(voice);
    expect(
        screen.getByRole('dialog', { name: 'Voice input is coming soon' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(voice).toHaveFocus();

    const photo = screen.getByRole('button', { name: 'Photo' });
    await user.click(photo);
    const dialog = screen.getByRole('dialog', {
        name: 'Image input is coming soon',
    });
    expect(dialog).toBeVisible();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(photo).toHaveFocus();
});
