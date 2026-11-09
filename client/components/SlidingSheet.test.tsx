import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockPickerEnvironment } from '../test/pickerEnvironment';
import SlidingSheet from './SlidingSheet';

beforeEach(() => {
    vi.useFakeTimers();
    mockPickerEnvironment();
    vi.stubGlobal(
        'PointerEvent',
        class extends MouseEvent {
            pointerId: number;
            isPrimary: boolean;
            constructor(type: string, init: PointerEventInit = {}) {
                super(type, init);
                this.pointerId = init.pointerId ?? 1;
                this.isPrimary = init.isPrimary ?? true;
            }
        },
    );
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function setup(dismissible = true) {
    const onClose = vi.fn();
    const view = render(
        <SlidingSheet
            label="Example"
            onClose={onClose}
            dismissible={dismissible}
        >
            <p>Scrollable content</p>
        </SlidingSheet>,
    );
    const panel = screen.getByRole('dialog', { name: 'Example' });
    const handle = screen.getByRole('button', { name: 'Close sheet' });
    Object.assign(handle, {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        hasPointerCapture: () => true,
    });
    vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(
        () =>
            new DOMRect(
                0,
                200 +
                    (parseFloat(
                        panel.style.getPropertyValue('--sheet-offset'),
                    ) || 0),
                390,
                600,
            ),
    );
    return { ...view, onClose, panel, handle };
}

function dragTo(handle: HTMLElement, distance: number) {
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 200 + distance });
}

it('tracks the handle and snaps back after a short drag', () => {
    const { panel, handle, onClose } = setup();
    dragTo(handle, 40);
    expect(panel).toHaveAttribute('data-phase', 'dragging');
    expect(panel.style.getPropertyValue('--sheet-offset')).toBe('40px');
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 240 });
    expect(panel.style.getPropertyValue('--sheet-offset')).toBe('0px');
    expect(panel).toHaveAttribute('data-phase', 'settling');
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
});

it('slides away on a longer downward drag and dismisses only once', () => {
    const { panel, handle, onClose } = setup();
    dragTo(handle, 160);
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 360 });
    expect(panel).toHaveAttribute('data-phase', 'closing');
    expect(panel.style.getPropertyValue('--sheet-offset')).toBe(
        `${window.innerHeight - 200 + 16}px`,
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(handle, { detail: 1 });
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledOnce();
});

it('cancels a drag without closing the sheet', () => {
    const { panel, handle, onClose } = setup();
    dragTo(handle, 180);
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(panel.style.getPropertyValue('--sheet-offset')).toBe('0px');
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
});

it('does not drag when the gesture starts on content', () => {
    const { panel, onClose } = setup();
    const content = screen.getByText('Scrollable content');
    dragTo(content, 180);
    fireEvent.pointerUp(content, { pointerId: 1, clientY: 380 });
    expect(panel).toHaveAttribute('data-phase', 'idle');
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
});

it.each(['handle', 'escape', 'backdrop'])('dismisses using %s', (method) => {
    const { panel, handle, onClose } = setup();
    if (method === 'handle') fireEvent.click(handle, { detail: 0 });
    if (method === 'escape')
        fireEvent(panel, new Event('cancel', { cancelable: true }));
    if (method === 'backdrop')
        fireEvent.click(panel, { clientX: 500, clientY: 100 });
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).toHaveBeenCalledOnce();
});

it('prevents all dismissal methods while saving', () => {
    const { panel, handle, onClose } = setup(false);
    expect(handle).toBeDisabled();
    fireEvent.click(handle);
    fireEvent(panel, new Event('cancel', { cancelable: true }));
    fireEvent.click(panel, { clientX: 500, clientY: 100 });
    dragTo(handle, 200);
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 400 });
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
});

it('dismisses without waiting for animation when reduced motion is preferred', () => {
    const { handle, onClose } = setup();
    vi.mocked(window.matchMedia).mockReturnValue({
        matches: true,
    } as MediaQueryList);
    fireEvent.click(handle);
    expect(onClose).toHaveBeenCalledOnce();
});

it('clears a pending dismissal callback when unmounted', () => {
    const { handle, onClose, unmount } = setup();
    fireEvent.click(handle);
    unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
});

it('keeps background scroll locked through the exit and restores focus afterwards', () => {
    function Example() {
        const [open, setOpen] = useState(false);
        return (
            <>
                <button onClick={() => setOpen(true)}>Open</button>
                {open && (
                    <SlidingSheet
                        label="Example"
                        onClose={() => setOpen(false)}
                    >
                        Content
                    </SlidingSheet>
                )}
            </>
        );
    }
    document.body.style.overflow = 'scroll';
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    expect(document.body.style.overflow).toBe('hidden');
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('scroll');
    expect(trigger).toHaveFocus();
    document.body.style.overflow = '';
});

it('wraps keyboard focus within the sheet in both directions', () => {
    render(
        <SlidingSheet label="Focus example" onClose={vi.fn()}>
            <button type="button">First option</button>
            <button type="button" disabled>
                Unavailable
            </button>
            <button type="button">Last option</button>
            <button type="button" hidden>
                Hidden option
            </button>
        </SlidingSheet>,
    );
    const first = screen.getByRole('button', { name: 'Close sheet' });
    const last = screen.getByRole('button', { name: 'Last option' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
});
