import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MealIngredient } from '../../../shared/types/types';
import { useMicronutrientLookup } from '../../hooks/useMicronutrientLookup';
import MealMicronutrients from './MealMicronutrients';

vi.mock('../../hooks/useMicronutrientLookup', () => ({
    useMicronutrientLookup: vi.fn(),
}));

beforeEach(() => {
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: {},
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
});

const base = {
    weight: 100,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbohydratePer100g: 10,
    fatPer100g: 2,
};

it('shows known nutrient totals and names ingredients excluded by missing data', () => {
    const ingredients: MealIngredient[] = [
        { ...base, name: 'Spinach', ironPer100g: 2 },
        { ...base, name: 'Tofu' },
    ];
    render(<MealMicronutrients ingredients={ingredients} />);

    const section = screen.getByRole('region', {
        name: 'Meal key nutrients',
    });
    const ironRow = within(section)
        .getByRole('button', { name: 'Iron' })
        .closest('li')!;
    expect(ironRow).toHaveTextContent('2 mg');
    expect(ironRow).not.toHaveTextContent('Partial');
    expect(
        within(ironRow).getByRole('progressbar', {
            name: 'Iron daily value in this meal',
        }),
    ).toHaveAttribute(
        'aria-valuetext',
        '11% of Daily Value from ingredients with available data',
    );

    const ironContributors = within(ironRow).getByRole('button', {
        name: /Iron: 11% of Daily Value. Show contributing and missing ingredients/,
    });
    const ironPopup = ironContributors.nextElementSibling!;
    expect(ironPopup).toHaveTextContent('Spinach');
    expect(ironPopup).toHaveTextContent('Top 3 contributors in this meal');
    expect(ironPopup).toHaveTextContent('Missing data');
    expect(ironPopup).toHaveTextContent('Tofu');
    expect(ironPopup).toHaveTextContent(
        'These ingredients are excluded from the total above.',
    );

    const calciumRow = within(section)
        .getByRole('button', { name: 'Calcium' })
        .closest('li')!;
    expect(calciumRow).toHaveTextContent('N/A');
    expect(calciumRow).toHaveTextContent('Missing');
    const calciumTrigger = within(calciumRow).getByRole('button', {
        name: /Calcium: N\/A. Show contributing and missing ingredients/,
    });
    expect(calciumTrigger).toHaveTextContent('See missing ingredients');
    expect(calciumTrigger.nextElementSibling).toHaveTextContent(
        'Spinach, Tofu',
    );
});

it('shows saved nutrient values while missing values are still loading', () => {
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: {},
        loading: true,
        failed: [],
        retry: vi.fn(),
    });
    render(
        <MealMicronutrients
            ingredients={[{ ...base, name: 'Spinach', ironPer100g: 2 }]}
        />,
    );
    expect(
        screen.getByRole('status', { name: 'Updating key nutrients' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Iron' }).closest('li'),
    ).toHaveTextContent('2 mg');
});

it('reports newly found nutrients for a saved recipe without replacing its values', async () => {
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: {
            rice: {
                name: 'Rice, brown',
                ironPer100g: 9,
                zincPer100g: 1.5,
            },
        },
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
    const onNutritionFound = vi.fn();
    render(
        <MealMicronutrients
            ingredients={[
                {
                    ...base,
                    name: 'Rice',
                    ironPer100g: 0,
                },
            ]}
            onNutritionFound={onNutritionFound}
        />,
    );

    await waitFor(() => expect(onNutritionFound).toHaveBeenCalledOnce());
    expect(onNutritionFound).toHaveBeenCalledWith([
        {
            index: 0,
            name: 'Rice',
            nutrients: { zincPer100g: 1.5 },
        },
    ]);
});

it('keeps explicitly unavailable saved nutrients unavailable after another lookup', () => {
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: { rice: { name: 'Rice', ironPer100g: 5 } },
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
    render(
        <MealMicronutrients
            ingredients={[
                {
                    ...base,
                    name: 'Rice',
                    unavailableMicronutrients: ['ironPer100g'],
                },
            ]}
        />,
    );
    expect(
        screen.getByRole('button', { name: 'Iron' }).closest('li'),
    ).toHaveTextContent('N/A');
});

it('shows fiber before iron, scales it by portion, and keeps missing fiber distinct from zero', () => {
    render(
        <MealMicronutrients
            ingredients={[
                { ...base, name: 'Oats', weight: 50, fiberPer100g: 10 },
                { ...base, name: 'Tofu', fiberPer100g: 0 },
                { ...base, name: 'Unknown food' },
            ]}
        />,
    );

    const section = screen.getByRole('region', { name: 'Meal key nutrients' });
    expect(
        within(section).getByRole('heading', { name: 'Key nutrients' }),
    ).toBeInTheDocument();
    const fiberRow = within(section).getAllByText('Fiber')[0].closest('li')!;
    const ironRow = within(section)
        .getByRole('button', { name: 'Iron' })
        .closest('li')!;
    expect(
        fiberRow.compareDocumentPosition(ironRow) &
            Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fiberRow).toHaveTextContent('5 g');
    expect(
        within(fiberRow).getByRole('progressbar', {
            name: 'Fiber daily value in this meal',
        }),
    ).toHaveAttribute(
        'aria-valuetext',
        '18% of Daily Value from ingredients with available data',
    );
    const popup = within(fiberRow).getByRole('button', {
        name: /Fiber: 18% of Daily Value. Show contributing and missing ingredients/,
    }).nextElementSibling!;
    expect(popup).toHaveTextContent('Oats');
    expect(popup).toHaveTextContent('Unknown food');
    expect(
        popup.querySelector('.micronutrient-missing-data'),
    ).not.toHaveTextContent('Tofu');
});

it('includes lookup values in a partial total and treats measured zero as available', () => {
    vi.mocked(useMicronutrientLookup).mockReturnValue({
        data: {
            spinach: { name: 'Spinach', ironPer100g: 1 },
            tofu: { name: 'Tofu', ironPer100g: 0 },
        },
        loading: false,
        failed: [],
        retry: vi.fn(),
    });
    render(
        <MealMicronutrients
            ingredients={[
                { ...base, name: 'Spinach', weight: 200 },
                { ...base, name: 'Tofu' },
                { ...base, name: 'Unknown food' },
            ]}
        />,
    );
    const ironRow = screen.getByRole('button', { name: 'Iron' }).closest('li')!;
    expect(ironRow).toHaveTextContent('2 mg');
    expect(ironRow).not.toHaveTextContent('Partial');
    const popup = within(ironRow).getByRole('button', {
        name: /Show contributing and missing ingredients/,
    }).nextElementSibling!;
    expect(popup).toHaveTextContent('Spinach');
    const missingData = popup.querySelector('.micronutrient-missing-data')!;
    expect(missingData).toHaveTextContent('Unknown food');
    expect(missingData).not.toHaveTextContent('Tofu');
});
