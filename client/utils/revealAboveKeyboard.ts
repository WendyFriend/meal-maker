/** Room kept below a field for the start of its suggestions list. */
const ROOM_BELOW = 168;
const MARGIN = 12;
/** How long to follow the on-screen keyboard as it slides in. */
const FOLLOW_MS = 700;

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

function setKeyboardInset(px: number) {
    document.documentElement.style.setProperty(
        '--keyboard-inset',
        `${Math.max(0, Math.round(px))}px`,
    );
}

/**
 * Keeps a focused field, and the start of its suggestions, above the
 * on-screen keyboard. iOS overlays the keyboard without resizing the page,
 * so this also adds the keyboard's height as temporary scroll room
 * (`--keyboard-inset`) until the field loses focus.
 */
export function revealAboveKeyboard(
    field: HTMLElement,
    roomBelow = ROOM_BELOW,
) {
    const viewport = window.visualViewport;
    const started = performance.now();
    let frame = 0;

    const reveal = () => {
        if (document.activeElement !== field) return stop();
        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = viewport
            ? viewport.offsetTop + viewport.height
            : window.innerHeight;
        setKeyboardInset(window.innerHeight - visibleBottom);

        const scroller = scrollParent(field);
        const scrollerTop =
            scroller === document.scrollingElement
                ? 0
                : scroller.getBoundingClientRect().top;
        const top = Math.max(visibleTop, scrollerTop) + MARGIN;
        const bottom = visibleBottom - MARGIN;
        const rect = field.getBoundingClientRect();
        // Scroll up enough to show the field and its first suggestions,
        // but never push the field itself out of the top.
        const distance =
            rect.top < top
                ? rect.top - top
                : Math.max(
                      0,
                      Math.min(
                          rect.bottom + roomBelow - bottom,
                          rect.top - top,
                      ),
                  );
        if (Math.abs(distance) > 1) scroller.scrollBy?.({ top: distance });
    };

    const follow = () => {
        reveal();
        if (performance.now() - started < FOLLOW_MS)
            frame = requestAnimationFrame(follow);
    };

    function stop() {
        cancelAnimationFrame(frame);
        viewport?.removeEventListener('resize', reveal);
        field.removeEventListener('blur', stop);
        setKeyboardInset(0);
    }

    viewport?.addEventListener('resize', reveal);
    field.addEventListener('blur', stop);
    frame = requestAnimationFrame(follow);
    return stop;
}
