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

function reduceMotion() {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
    }));
}

it('caps the suggestions to the room above the keyboard', () => {
    const { field } = setup(300);
    revealAboveKeyboard(field, 0);
    // 500 visible - 12 margin - field bottom 340.
    expect(
        document.documentElement.style.getPropertyValue('--suggestions-room'),
    ).toBe('148px');
});

it('eases a covered field and its suggestions above the keyboard', () => {
    const { field, scrollBy } = setup(600);
    const stop = revealAboveKeyboard(field, 160);
    // Field bottom 640 + 160 room must end at 500 - 12: 312px, glided to
    // rather than jumped.
    const [{ top }] = scrollBy.mock.calls[0];
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(312);
    expect(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('300px');
    vi.useFakeTimers();
    stop();
    // Kept briefly, so moving to the next field does not jump the page.
    expect(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('300px');
    vi.useRealTimers();
});

it('gives the room back gradually as the keyboard goes down', () => {
    const { field } = setup(600);
    const stop = revealAboveKeyboard(field, 160);
    // Frames advance the clock too, as they would in a browser.
    vi.useFakeTimers({
        toFake: [
            'setTimeout',
            'clearTimeout',
            'requestAnimationFrame',
            'cancelAnimationFrame',
            'performance',
        ],
    });
    stop();
    // The keyboard closes.
    vi.stubGlobal('visualViewport', {
        offsetTop: 0,
        height: 800,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    vi.advanceTimersByTime(100);
    vi.advanceTimersToNextFrame();
    const inset = () =>
        parseFloat(
            document.documentElement.style.getPropertyValue('--keyboard-inset'),
        );
    // A step down, not straight to nothing…
    expect(inset()).toBeGreaterThan(0);
    expect(inset()).toBeLessThan(300);
    // …until it is gone.
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(inset()).toBe(0);
});

it('keeps the keyboard room when focus moves straight to another field', () => {
    const { field } = setup(600);
    vi.useFakeTimers();
    const stop = revealAboveKeyboard(field, 160);
    vi.advanceTimersToNextFrame();
    stop();
    revealAboveKeyboard(field, 0);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('300px');
});

it('never pushes the field under the header', () => {
    const { field, scrollBy } = setup(200);
    reduceMotion();
    revealAboveKeyboard(field, 400);
    // Only as far as the top of the scroll area (60 + 12).
    expect(scrollBy).toHaveBeenCalledWith({ top: 128 });
});

it('leaves a visible field where it is', () => {
    const { field, scrollBy } = setup(150);
    revealAboveKeyboard(field, 160);
    expect(scrollBy).not.toHaveBeenCalled();
});

it('eases to a field below the screen instead of jumping', () => {
    // A meal just added at the end of the list, below the fold.
    const { field, scrollBy } = setup(1200);
    revealAboveKeyboard(field, 160);
    // A first step of the 912px, not the whole way at once.
    const [{ top }] = scrollBy.mock.calls[0];
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(912);
});

it('jumps instead of gliding when motion is reduced', () => {
    const { field, scrollBy } = setup(1200);
    reduceMotion();
    revealAboveKeyboard(field, 160);
    expect(scrollBy).toHaveBeenCalledWith({ top: 912 });
});

it('eases a visible field up under the header when aligning to the top', () => {
    const { field, scrollBy } = setup(150);
    revealAboveKeyboard(field, 0, 'top');
    // A first step of the 150 - (60 + 12) = 78px, not the whole way at once.
    const [{ top }] = scrollBy.mock.calls[0];
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(78);
});

it('reserves scroll room for the glide before the keyboard is up', () => {
    const { field } = setup(400);
    // No keyboard yet: the whole window is visible.
    vi.stubGlobal('visualViewport', {
        offsetTop: 0,
        height: 800,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    revealAboveKeyboard(field, 0, 'top');
    // 400 - 72 to glide, plus the margin, so it never stops short.
    expect(
        document.documentElement.style.getPropertyValue('--keyboard-inset'),
    ).toBe('340px');
});
