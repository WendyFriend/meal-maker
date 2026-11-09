import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockPickerEnvironment } from '../test/pickerEnvironment';
import ActionFeedback from './ActionFeedback';

beforeEach(() => mockPickerEnvironment());
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('preserves the existing modal confirmation behavior', () => {
    const { unmount } = render(
        <ActionFeedback message="Added to My Day" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
});

it('supports a shorter confirmation on My Recipes', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
        <ActionFeedback
            message="Added to My Plan"
            durationMs={1000}
            onClose={onClose}
        />,
    );
    act(() => vi.advanceTimersByTime(999));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledOnce();
});
