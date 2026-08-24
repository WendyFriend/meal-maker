import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import Calories from './Calories';

describe('Calories', () => {
    it('shows no preference when value is undefined', () => {
        render(<Calories value={undefined} onChange={vi.fn()} />);

        const picker = screen.getByRole('button');

        expect(picker).toHaveTextContent('No preference');
    });

    it('shows the selected calorie goal', () => {
        const onChange = vi.fn();

        render(<Calories value={500} onChange={onChange} />);

        const picker = screen.getByRole('button');

        expect(picker).toHaveTextContent('500 kcal');
    });
});
