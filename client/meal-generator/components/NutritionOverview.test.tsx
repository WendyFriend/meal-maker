import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import NutritionOverview from './NutritionOverview';

const nutrition = { calories: 200, carbohydrate: 24, protein: 12, fat: 6 };
const percentages = { carbohydrate: 50, protein: 25, fat: 25 };

it('shows fibre separately from the macro calorie chart', () => {
    render(
        <NutritionOverview
            nutrition={nutrition}
            percentages={percentages}
            fiber={{
                grams: 4.5,
                available: true,
                hasKnown: true,
                incomplete: false,
            }}
        />,
    );

    expect(screen.getByText('Fibre').parentElement).toHaveTextContent('4.5g');
    expect(
        screen.getByRole('group', { name: 'Macro calorie proportions' }),
    ).toBeInTheDocument();
    const fiberButton = screen.getByRole('button', {
        name: 'Fibre: 4.5 grams',
    });
    expect(fiberButton).toHaveAttribute('data-active', 'false');
    fireEvent.click(fiberButton);
    expect(fiberButton).toHaveAttribute('data-active', 'true');
    expect(
        screen.queryByRole('button', { name: /Fibre.*macro calories/ }),
    ).not.toBeInTheDocument();
});

it('keeps known fibre visible when other nutrition is unavailable', () => {
    render(
        <NutritionOverview
            nutrition={nutrition}
            percentages={percentages}
            incomplete
            fiber={{
                grams: 2,
                available: true,
                hasKnown: true,
                incomplete: false,
            }}
        />,
    );

    const overview = screen.getByRole('region', { name: 'Nutrition overview' });
    expect(within(overview).getByText('Fibre').parentElement).toHaveTextContent(
        '2g',
    );
    expect(
        within(overview).getByRole('group', { name: 'Total calories' }),
    ).toHaveTextContent('—');
    expect(
        screen.queryByRole('group', { name: 'Macro calorie proportions' }),
    ).not.toBeInTheDocument();
});

it('puts the partial nutrition explanation behind an info button', () => {
    render(
        <NutritionOverview
            nutrition={nutrition}
            percentages={percentages}
            partial
            fiber={{
                grams: 4.5,
                available: false,
                hasKnown: true,
                incomplete: true,
            }}
        />,
    );

    const overview = screen.getByRole('region', { name: 'Nutrition overview' });
    const info = within(overview).getByRole('button', {
        name: 'About nutrition data',
    });
    expect(overview.querySelector('.nutrition-overview-partial')).toBeNull();
    expect(
        document.getElementById(info.getAttribute('popovertarget')!),
    ).toHaveTextContent('Based on ingredients with available nutrition data');
});
