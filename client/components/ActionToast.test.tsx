import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ActionToast from './ActionToast';

afterEach(() => vi.useRealTimers());

it('announces a brief message without taking focus', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    const { unmount } = render(
        <ActionToast message="Broccoli added" onClose={onClose} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Broccoli added');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveClass('action-toast--inline');
    expect(document.activeElement).toBe(button);
    expect(
        document.querySelector('.action-toast-symbol svg'),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2400));
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    button.remove();
});

it('supports custom colors and floating placement', () => {
    render(
        <ActionToast
            message="Ingredients updated"
            placement="floating"
            colors={{ background: '#fff', icon: '#27813a' }}
            onClose={vi.fn()}
        />,
    );

    expect(screen.getByRole('status')).toHaveClass('action-toast--floating');
    expect(screen.getByRole('status')).toHaveStyle({
        '--action-toast-background': '#fff',
        '--action-toast-icon': '#27813a',
    });
});

it('offers a tappable action without an icon', () => {
    const onUndo = vi.fn();
    render(
        <ActionToast
            message="Meal removed"
            placement="floating"
            icon={null}
            action={{ label: 'Undo', onClick: onUndo }}
        />,
    );
    expect(screen.getByRole('status')).toHaveClass('action-toast--actionable');
    expect(
        document.querySelector('.action-toast-symbol'),
    ).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Undo' }).click();
    expect(onUndo).toHaveBeenCalledOnce();
});
