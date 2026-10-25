import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Calories from './Calories';
import { mockPickerEnvironment } from '../../test/pickerEnvironment';

// Test our integration with the wheel's controlled value/callback API. Native
// wheel scrolling and viewport geometry are checked separately in Chrome.
vi.mock('@ncdai/react-wheel-picker', () => ({
    WheelPickerWrapper: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
    ),
    WheelPicker: ({
        value,
        onValueChange,
        options,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: { label: string; value: string }[];
    }) => (
        <select
            aria-label="Mobile calorie wheel"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

function Form({
    initial,
    onChange = vi.fn(),
}: {
    initial?: number;
    onChange?: (value: number | undefined) => void;
}) {
    const [value, setValue] = useState(initial);
    return (
        <>
            <Calories
                value={value}
                onChange={(next) => {
                    setValue(next);
                    onChange(next);
                }}
            />
            <button>After</button>
        </>
    );
}

let setMobile: (mobile: boolean) => void;
beforeEach(() => {
    setMobile = mockPickerEnvironment();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

function activeOption() {
    const list = screen.getByRole('listbox', { name: 'Calorie goal' });
    return document.getElementById(list.getAttribute('aria-activedescendant')!);
}

describe('responsive calorie selector', () => {
    it('keeps the current placeholder and exposes its unset state accessibly', () => {
        render(<Calories value={undefined} onChange={vi.fn()} />);
        expect(
            screen.getByRole('button', { name: 'Calorie goal, no preference' }),
        ).toHaveTextContent('e.g. 600');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('opens the desktop list with the selected value, commits a choice and restores focus', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Form initial={500} onChange={onChange} />);
        await user.click(
            screen.getByRole('button', { name: 'Calorie goal, 500 kcal' }),
        );
        const list = screen.getByRole('listbox', { name: 'Calorie goal' });
        expect(list).toHaveFocus();
        expect(within(list).getAllByRole('option')).toHaveLength(20);
        expect(
            within(list).getByRole('option', { name: '500 kcal' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.queryByLabelText('Mobile calorie wheel'),
        ).not.toBeInTheDocument();
        await user.click(
            within(list).getByRole('option', { name: '550 kcal' }),
        );
        expect(onChange).toHaveBeenCalledWith(550);
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Calorie goal, 550 kcal' }),
        ).toHaveFocus();
    });

    it('clears the goal through No preference', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Form initial={500} onChange={onChange} />);
        await user.click(
            screen.getByRole('button', { name: 'Calorie goal, 500 kcal' }),
        );
        await user.click(screen.getByRole('option', { name: 'No preference' }));
        expect(onChange).toHaveBeenCalledWith(undefined);
        expect(
            screen.getByRole('button', { name: 'Calorie goal, no preference' }),
        ).toHaveAttribute('aria-expanded', 'false');
    });

    it('supports arrows, Home/End, typeahead and Enter without changing the value while browsing', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Form initial={500} onChange={onChange} />);
        screen.getByRole('button', { name: 'Calorie goal, 500 kcal' }).focus();
        await user.keyboard('{ArrowDown}');
        expect(activeOption()).toHaveTextContent('500');
        await user.keyboard('{ArrowDown}');
        expect(activeOption()).toHaveTextContent('550');
        await user.keyboard('{Home}');
        expect(activeOption()).toHaveTextContent('No preference');
        await user.keyboard('{End}');
        expect(activeOption()).toHaveTextContent('1000');
        await user.keyboard('700');
        expect(activeOption()).toHaveTextContent('700');
        expect(onChange).not.toHaveBeenCalled();
        await user.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledExactlyOnceWith(700);
    });

    it.each(['Escape', 'outside', 'trigger', 'Tab'])(
        'dismisses desktop with %s without committing a new value',
        async (method) => {
            const user = userEvent.setup();
            const onChange = vi.fn();
            render(<Form initial={500} onChange={onChange} />);
            const trigger = screen.getByRole('button', {
                name: 'Calorie goal, 500 kcal',
            });
            await user.click(trigger);
            await user.keyboard('{ArrowDown}');
            if (method === 'Escape') await user.keyboard('{Escape}');
            if (method === 'outside')
                fireEvent.pointerDown(
                    screen.getByRole('button', { name: 'After' }),
                );
            if (method === 'trigger') await user.click(trigger);
            if (method === 'Tab') await user.tab();
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
            expect(onChange).not.toHaveBeenCalled();
            if (method === 'Escape') expect(trigger).toHaveFocus();
            if (method === 'Tab')
                expect(
                    screen.getByRole('button', { name: 'After' }),
                ).toHaveFocus();
        },
    );

    it('keeps the controlled wheel on mobile and closes with Escape or the backdrop', async () => {
        setMobile(true);
        const user = userEvent.setup();
        const onChange = vi.fn();
        const { container } = render(
            <Form initial={500} onChange={onChange} />,
        );
        await user.click(
            screen.getByRole('button', { name: 'Calorie goal, 500 kcal' }),
        );
        expect(
            screen.getByRole('dialog', { name: 'Calorie goal' }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText('Mobile calorie wheel')).toHaveValue(
            '500',
        );
        await user.selectOptions(
            screen.getByLabelText('Mobile calorie wheel'),
            '550',
        );
        expect(onChange).toHaveBeenCalledWith(550);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        const trigger = screen.getByRole('button', {
            name: 'Calorie goal, 550 kcal',
        });
        expect(trigger).toHaveFocus();
        await user.click(trigger);
        await user.click(container.querySelector('.bottom-sheet-backdrop')!);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('preserves the goal when switching between dropdown and wheel while open', async () => {
        const user = userEvent.setup();
        render(<Form initial={500} />);
        await user.click(
            screen.getByRole('button', { name: 'Calorie goal, 500 kcal' }),
        );
        act(() => setMobile(true));
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Mobile calorie wheel')).toHaveValue(
            '500',
        );
        await user.selectOptions(
            screen.getByLabelText('Mobile calorie wheel'),
            '650',
        );
        act(() => setMobile(false));
        expect(
            screen.queryByLabelText('Mobile calorie wheel'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('option', { name: '650 kcal' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('listbox')).toHaveFocus();
    });
});
