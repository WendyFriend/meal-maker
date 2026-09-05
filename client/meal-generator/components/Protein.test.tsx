import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import Protein from './Protein';

describe('Protin', () => {
    it('shows no preference when value is undefined', () => {
        render(<Protein value={undefined} onChange={vi.fn()} />);

        const picker = screen.getByRole('button');

        expect(picker).toHaveTextContent('No preference');
    });

    it('shows the selected protein goal', () => {
        const onChange = vi.fn();

        render(<Protein value={20} onChange={onChange} />);

        const picker = screen.getByRole('button');

        expect(picker).toHaveTextContent('20%');
    });
});
