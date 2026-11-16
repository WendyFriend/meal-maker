import { fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import IngredientThumbnail from './IngredientThumbnail';

afterEach(() => window.localStorage.clear());

it('shows the Nutrition Lab picture for a food id and falls back when it is missing', () => {
    const { container } = render(
        <IngredientThumbnail name="Broccoli" fdcId={170379} />,
    );
    const image = container.querySelector('img');
    expect(image).toHaveAttribute(
        'src',
        'https://mealmaker.brotherk3d.com/api/v1/thumbnails/170379.webp?size=128',
    );
    expect(image).toHaveAttribute('alt', '');

    fireEvent.error(image!);

    expect(container.querySelector('img')).toBeNull();
    expect(
        container.querySelector('.meal-ingredient-thumbnail'),
    ).toBeInTheDocument();
});

it('can request the smaller Nutrition Lab thumbnail for compact uses', () => {
    const { container } = render(
        <IngredientThumbnail name="Broccoli" fdcId={170379} size={64} />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://mealmaker.brotherk3d.com/api/v1/thumbnails/170379.webp?size=64',
    );
});

it('uses the local thumbnail when the ingredient has no food id', () => {
    const { container } = render(<IngredientThumbnail name="Broccoli" />);
    expect(container.querySelector('img')).toBeNull();
});
