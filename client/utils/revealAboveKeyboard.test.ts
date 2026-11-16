import { afterEach, expect, it, vi } from 'vitest';
import { revealAboveKeyboard } from './revealAboveKeyboard';

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--keyboard-inset');
});

function setup(fieldTop: number) {
    vi.stubGlobal('innerHeight', 800);
    // The keyboard covers the bottom 300px.
    vi.stubGlobal('visualViewport', {
        offsetTop: 0,
        height: 500,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    // Run only the first frame; later frames follow the keyboard animation.
    let frames = 0;
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
        if (frames++ === 0) run();
        return frames;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
        scrollHeight: { value: 2000 },
        clientHeight: { value: 700 },
    });
    scroller.getBoundingClientRect = () => ({ top: 60 }) as DOMRect;
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    const field = document.createElement('input');
    field.getBoundingClientRect = () =>
        ({ top: fieldTop, bottom: fieldTop + 40 }) as DOMRect;
    scroller.append(field);
    document.body.append(scroller);
    field.focus();
    return { field, scrollBy };
}

it('scrolls a covered field and its suggestions above the keyboard', () => {
    const { field, scrollBy } = setup(600);
    const stop = revealAboveKeyboard(field, 160);
    // Field bottom 640 + 160 room must end at 500 - 12.
    expect(scrollBy).toHaveBeenCalledWith({ top: 312 });
    expect(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('300px');
    stop();
    expect(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('0px');
});

it('never pushes the field under the header', () => {
    const { field, scrollBy } = setup(200);
    revealAboveKeyboard(field, 400);
    // Only as far as the top of the scroll area (60 + 12).
    expect(scrollBy).toHaveBeenCalledWith({ top: 128 });
});

it('leaves a visible field where it is', () => {
    const { field, scrollBy } = setup(150);
    revealAboveKeyboard(field, 160);
    expect(scrollBy).not.toHaveBeenCalled();
});
