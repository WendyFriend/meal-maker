import { fireEvent, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import IngredientThumbnail from './IngredientThumbnail';

it('shows the Nutrition Lab picture for a food id and falls back when it is missing', () => {
    const { container } = render(
        <IngredientThumbnail name="Broccoli" fdcId={170379} />,
    );
    const image = container.querySelector('img');
    expect(image).toHaveAttribute(
        'src',
        'https://mealmaker.brotherk3d.com/api/v1/thumbnails/170379.webp',
    );
    expect(image).toHaveAttribute('alt', '');

    fireEvent.error(image!);

    expect(container.querySelector('img')).toBeNull();
    expect(
        container.querySelector('.meal-ingredient-thumbnail'),
    ).toBeInTheDocument();
});

it('uses the local thumbnail when the ingredient has no food id', () => {
    const { container } = render(<IngredientThumbnail name="Broccoli" />);
    expect(container.querySelector('img')).toBeNull();
});
