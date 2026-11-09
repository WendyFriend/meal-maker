import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import IngredientThumbnail from './IngredientThumbnail';
import { saveMealGenerator } from '../../settings/mealGenerator';

beforeEach(() => saveMealGenerator('nutrition-lab'));
afterEach(() => window.localStorage.clear());

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

it('does not request Nutrition Lab images when Ollama is selected, including previously saved Nutrition Lab meals', () => {
    const { container, rerender } = render(
        <IngredientThumbnail
            name="Broccoli"
            fdcId={170379}
            source="nutrition-lab"
        />,
    );
    expect(container.querySelector('img')).not.toBeNull();
    saveMealGenerator('ollama');
    rerender(
        <IngredientThumbnail
            name="Broccoli"
            fdcId={170379}
            source="nutrition-lab"
        />,
    );
    expect(container.querySelector('img')).toBeNull();
    rerender(<IngredientThumbnail name="Broccoli" fdcId={170379} />);
    expect(container.querySelector('img')).toBeNull();
    saveMealGenerator('nutrition-lab');
    rerender(
        <IngredientThumbnail
            name="Broccoli"
            fdcId={170379}
            source="nutrition-lab"
        />,
    );
    expect(container.querySelector('img')).not.toBeNull();
});

it('switches from Nutrition Lab images to local images for Ollama results even with the same food id', () => {
    const { container, rerender } = render(
        <IngredientThumbnail
            name="Broccoli"
            fdcId={170379}
            source="nutrition-lab"
        />,
    );
    expect(container.querySelector('img')).not.toBeNull();
    rerender(
        <IngredientThumbnail name="Broccoli" fdcId={170379} source="local" />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.meal-ingredient-thumbnail')).toHaveStyle({
        backgroundImage: expect.stringContaining('url('),
    });
    rerender(
        <IngredientThumbnail
            name="Broccoli"
            fdcId={170379}
            source="nutrition-lab"
        />,
    );
    expect(container.querySelector('img')).not.toBeNull();
});
