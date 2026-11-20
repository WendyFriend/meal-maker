import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import MealPhotoPage from './MealPhotoPage';

const photo = {
    id: '1',
    src: 'data:image/jpeg;base64,big',
    ingredients: ['tomato', 'basil', 'rice'],
    scanning: false,
};

function setup() {
    // Removal skips the chip animation, as with reduced motion.
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
    }));
    const props = {
        onOpenIngredient: vi.fn(),
        onRemoveIngredient: vi.fn(),
        onRemovePhoto: vi.fn(),
    };
    render(
        <MealPhotoPage
            photo={photo}
            // Rice was removed from the meal since.
            ingredients={['Tofu', 'tomato', 'basil']}
            isSaved={(name) => name === 'basil'}
            {...props}
        />,
    );
    return props;
}

it('shows the photo full size with its foods as chips', async () => {
    const props = setup();
    const user = userEvent.setup();
    expect(document.querySelector('.meal-photo-page-image')).toHaveAttribute(
        'src',
        photo.src,
    );
    const chips = screen.getByRole('group', { name: 'Foods in this photo' });
    expect(chips).toHaveTextContent('tomato');
    expect(chips).toHaveTextContent('basil');
    expect(chips).not.toHaveTextContent('Tofu');
    // No clear-all ✕ here.
    expect(
        screen.queryByRole('button', {
            name: 'Clear all selected ingredients',
        }),
    ).not.toBeInTheDocument();

    await user.click(
        screen.getByRole('button', { name: 'Edit nutrition for basil, saved' }),
    );
    expect(props.onOpenIngredient).toHaveBeenCalledWith('basil');
    await user.click(screen.getByRole('button', { name: 'Remove tomato' }));
    expect(props.onRemoveIngredient).toHaveBeenCalledWith('tomato');
    vi.unstubAllGlobals();
});

it('removes the photo with its foods', async () => {
    const props = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove Photo' }));
    expect(props.onRemovePhoto).toHaveBeenCalled();
    vi.unstubAllGlobals();
});
