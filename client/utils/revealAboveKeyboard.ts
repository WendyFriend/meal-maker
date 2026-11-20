/**
 * Room kept below a field for the start of its suggestions list: about two
 * and a half rows, so the third shows it scrolls. The list itself is capped
 * to the room left above the keyboard (`--suggestions-room`), so the page
 * moves as little as it can.
 */
const ROOM_BELOW = 112;
const MARGIN = 12;
/** How long to follow the on-screen keyboard as it slides in. */
const FOLLOW_MS = 700;
/**
 * Grace before giving the keyboard's scroll room back, so moving from one
 * field to the next does not start a release. Short: the release follows the
 * keyboard down anyway, so the page slides with it rather than after it.
 */
const RELEASE_MS = 60;
/**
 * Every move eases in frame by frame with this time constant (ms), so the
 * page glides with the keyboard as one motion instead of jumping. A browser
 * smooth scroll would be cut short by iOS when the keyboard opens, and the
 * correction after it jumped; easing re-aims every frame instead.
 */
const EASE_MS = 90;
/** Longest an eased move keeps chasing a moving target. */
const EASE_LIMIT_MS = 1600;
let pendingRelease: ReturnType<typeof setTimeout> | undefined;
let releaseFrame = 0;
let wakeRelease: (() => void) | undefined;

function scrollParent(element: HTMLElement): HTMLElement {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight
        )
            return node;
    }
    return (document.scrollingElement as HTMLElement) ?? document.body;
}

function keyboardInset() {
    return (
        parseFloat(
            document.documentElement.style.getPropertyValue('--keyboard-inset'),
        ) || 0
    );
}

function setKeyboardInset(px: number) {
    document.documentElement.style.setProperty(
        '--keyboard-inset',
        `${Math.max(0, Math.round(px))}px`,
    );
}

/** Height of the on-screen keyboard (0 when it is down). */
function keyboardHeight() {
    const viewport = window.visualViewport;
    return viewport
        ? Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height)
        : 0;
}

/**
 * Gives the keyboard's scroll room back gradually, never faster than the
 * keyboard leaves, so a page scrolled into that room slides down with it
 * (as native lists do) instead of snapping when the room vanishes.
 */
function releaseKeyboardInset(reducedMotion: boolean) {
    stopRelease();
    if (reducedMotion) return setKeyboardInset(0);
    const viewport = window.visualViewport;
    let last = 0;
    const step = () => {
        releaseFrame = 0;
        const now = performance.now();
        const elapsed = last ? Math.min(48, now - last) : 16;
        last = now;
        const target = keyboardHeight();
        const current = keyboardInset();
        // Whole pixels, at least one a frame, so rounding never stalls it.
        const next = Math.min(
            current - 1,
            Math.round(
                target + (current - target) * Math.exp(-elapsed / EASE_MS),
            ),
        );
        if (next - target >= 1) {
            setKeyboardInset(next);
            releaseFrame = requestAnimationFrame(step);
            return;
        }
        setKeyboardInset(target);
        if (target > 0) {
            // The keyboard is still up (focus went to a field this does not
            // manage): wait for it to move, then follow it down.
            last = 0;
            return;
        }
        stopRelease();
    };
    wakeRelease = () => {
        if (!releaseFrame) releaseFrame = requestAnimationFrame(step);
    };
    viewport?.addEventListener('resize', wakeRelease);
    wakeRelease();
}

function stopRelease() {
    cancelAnimationFrame(releaseFrame);
    releaseFrame = 0;
    if (wakeRelease)
        window.visualViewport?.removeEventListener('resize', wakeRelease);
    wakeRelease = undefined;
}

/**
 * Keeps a focused field, and the start of its suggestions, above the
 * on-screen keyboard. iOS overlays the keyboard without resizing the page,
 * so this also adds the keyboard's height as temporary scroll room
 * (`--keyboard-inset`). The room only grows while fields are being edited
 * (the keyboard changing height, e.g. text to number pad, never pulls the
 * page), and eases away after the last field loses focus.
 *
 * `align: 'top'` instead eases the field up to the top of the visible area
 * (e.g. Meal Maker's search, so the chips under it stay in view).
 */
export function revealAboveKeyboard(
    field: HTMLElement,
    roomBelow = ROOM_BELOW,
    align: 'nearest' | 'top' = 'nearest',
) {
    clearTimeout(pendingRelease);
    stopRelease();
    const viewport = window.visualViewport;
    const started = performance.now();
    const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false;
    let frame = 0;
    let lastStep = 0;
    let settled = false;
    /**
     * Scroll room kept for a move to the top. The keyboard's own room only
     * arrives as it slides in, so without this the move would stop short.
     */
    let reserved = 0;

    /** Scrolls toward the field once; returns false when focus has left. */
    const reveal = () => {
        if (document.activeElement !== field) return false;
        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = viewport
            ? viewport.offsetTop + viewport.height
            : window.innerHeight;
        const keyboard = window.innerHeight - visibleBottom;
        const scroller = scrollParent(field);
        const scrollerTop =
            scroller === document.scrollingElement
                ? 0
                : scroller.getBoundingClientRect().top;
        const top = Math.max(visibleTop, scrollerTop) + MARGIN;
        const rect = field.getBoundingClientRect();
        // Show the field and its first suggestions, but never push the
        // field itself out of the top.
        const distance =
            align === 'top' || rect.top < top
                ? rect.top - top
                : Math.max(
                      0,
                      Math.min(
                          rect.bottom + roomBelow - (visibleBottom - MARGIN),
                          rect.top - top,
                      ),
                  );
        if (align === 'top' && distance > 0 && !reserved)
            reserved = distance + MARGIN;
        // Grow only: shrinking under a scrolled page would snap it.
        setKeyboardInset(Math.max(keyboardInset(), keyboard, reserved));
        document.documentElement.style.setProperty(
            '--suggestions-room',
            `${Math.max(0, Math.round(visibleBottom - MARGIN - rect.bottom))}px`,
        );

        settled = Math.abs(distance) <= 1;
        if (settled) return true;
        if (reducedMotion) {
            scroller.scrollBy?.({ top: distance });
            return true;
        }
        const now = performance.now();
        const elapsed = lastStep ? Math.min(48, now - lastStep) : 16;
        lastStep = now;
        const step = distance * (1 - Math.exp(-elapsed / EASE_MS));
        scroller.scrollBy?.({
            top: Math.abs(step) < 1 ? Math.sign(distance) : Math.round(step),
        });
        return true;
    };

    const follow = () => {
        frame = 0;
        if (!reveal()) return stop();
        const elapsed = performance.now() - started;
        if (elapsed < FOLLOW_MS || (!settled && elapsed < EASE_LIMIT_MS))
            frame = requestAnimationFrame(follow);
    };

    // Moves happen once per frame; a keyboard resize wakes the loop.
    const wake = () => {
        if (!frame) frame = requestAnimationFrame(follow);
    };

    function stop() {
        cancelAnimationFrame(frame);
        viewport?.removeEventListener('resize', wake);
        field.removeEventListener('blur', stop);
        clearTimeout(pendingRelease);
        pendingRelease = setTimeout(
            () => releaseKeyboardInset(reducedMotion),
            RELEASE_MS,
        );
    }

    viewport?.addEventListener('resize', wake);
    field.addEventListener('blur', stop);
    wake();
    return stop;
}
