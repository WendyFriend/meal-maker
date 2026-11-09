import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import MealInstructions from './MealInstructions';

it('shows all supplied steps in one numbered cooking section', () => {
    render(
        <MealInstructions
            instructions={[
                'Preparation: Rinse the lentils.',
                'Cooking: Simmer for 20 minutes.',
            ]}
        />,
    );

    expect(
        screen.queryByRole('heading', { name: 'Prepare your ingredients' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cook & serve' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Rinse the lentils.')).toBeVisible();
    expect(screen.getByText('Simmer for 20 minutes.')).toBeVisible();
});

it('shows a calm empty state when a recipe has no steps', () => {
    render(<MealInstructions instructions={[]} />);
    expect(screen.getByText('No steps added.')).toBeVisible();
});
