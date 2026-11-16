import { useEffect, useLayoutEffect, useRef } from 'react';

/** Movement beyond this is a scroll or drag, not a tap. */
const TAP_SLOP = 10;

/**
 * Surfaces opened from an edit (suggestions, sheets, menus, toasts) belong to
 * it, so tapping them does not count as leaving.
 */
const PART_OF_EDIT =
    'dialog, [popover], [role="dialog"], [role="listbox"], [role="menu"], .action-toast';

/**
 * Saves an in-place edit when the person moves on instead of confirming it,
 * like iOS lists: a tap outside the edit, leaving the page or app, or
 * unmounting. Scrolling does not count. `onLeave` must be safe to call when
 * nothing changed.
 */
export function useSaveOnLeave({
    active,
    containers,
    onLeave,
}: {
    active: boolean;
    /** Elements that make up the edit; taps inside them keep editing. */
    containers: () => (Node | null | undefined)[];
    onLeave: () => void;
}) {
    const latest = useRef({ active, containers, onLeave });
    useLayoutEffect(() => {
        latest.current = { active, containers, onLeave };
    });

    useEffect(() => {
        if (!active) return;
        let start: { x: number; y: number; id: number } | null = null;
        const leave = () => {
            if (latest.current.active) latest.current.onLeave();
        };
        const isOutside = (target: EventTarget | null) =>
            target instanceof Element &&
            !target.closest(PART_OF_EDIT) &&
            !latest.current
                .containers()
                .some((container) => container?.contains(target));
        const onPointerDown = (event: PointerEvent) => {
            start = isOutside(event.target)
                ? { x: event.clientX, y: event.clientY, id: event.pointerId }
                : null;
        };
        const onPointerUp = (event: PointerEvent) => {
            if (!start || start.id !== event.pointerId) return;
            const moved = Math.hypot(
                event.clientX - start.x,
                event.clientY - start.y,
            );
            start = null;
            if (moved <= TAP_SLOP) leave();
        };
        const onHidden = () => {
            if (document.visibilityState === 'hidden') leave();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('pagehide', leave);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('pointerup', onPointerUp, true);
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('pagehide', leave);
        };
    }, [active]);

    // Leaving the page (another tab, date or meal page) unmounts the edit.
    useEffect(
        () => () => {
            if (latest.current.active) latest.current.onLeave();
        },
        [],
    );
}
