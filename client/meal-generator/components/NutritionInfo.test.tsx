import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NutritionInfo from './NutritionInfo';

function setup() {
    render(
        <NutritionInfo label="Iron contributors" trigger="Iron track">
            <p>Tofu: 3 mg</p>
        </NutritionInfo>,
    );
    const trigger = screen.getByRole('button', { name: 'Iron contributors' });
    const panel = document.querySelector<HTMLDivElement>(
        '.nutrition-info-popover',
    )!;
    let open = false;
    vi.spyOn(panel, 'matches').mockImplementation(
        (selector) => selector === ':popover-open' && open,
    );
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        x: 100,
        y: 200,
        top: 200,
        left: 100,
        right: 400,
        bottom: 240,
        width: 300,
        height: 40,
        toJSON: () => ({}),
    });
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 300,
        bottom: 120,
        width: 300,
        height: 120,
        toJSON: () => ({}),
    });
    return {
        panel,
        setOpen: (value: boolean) => {
            open = value;
        },
    };
}

describe('nutrition popup placement', () => {
    it('stays hidden until the queued opening event places it below its trigger', () => {
        const { panel, setOpen } = setup();
        fireEvent(panel, new Event('beforetoggle'));
        setOpen(true);
        expect(panel.style.visibility).toBe('hidden');
        fireEvent(panel, new Event('toggle'));
        expect(panel.style.left).toBe('100px');
        expect(panel.style.top).toBe('248px');
        expect(panel.style.visibility).toBe('visible');
    });

    it('hides again on close and waits for fresh placement on reopening', () => {
        const { panel, setOpen } = setup();
        fireEvent(panel, new Event('beforetoggle'));
        setOpen(true);
        fireEvent(panel, new Event('toggle'));
        fireEvent(panel, new Event('beforetoggle'));
        setOpen(false);
        fireEvent(panel, new Event('toggle'));
        expect(panel.style.visibility).toBe('hidden');
        fireEvent(panel, new Event('beforetoggle'));
        setOpen(true);
        expect(panel.style.visibility).toBe('hidden');
        fireEvent(panel, new Event('toggle'));
        expect(panel.style.visibility).toBe('visible');
        expect(panel.style.top).toBe('248px');
    });
});
