import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react';
import { flushSync } from 'react-dom';

export const LONG_PRESS_MS = 450;
/** Matches the settle transition in the list's CSS. */
export const REORDER_SETTLE_MS = 220;
const MOVE_TOLERANCE = 10;
const LIFT_SCALE = 1.03;
/**
 * The lifted item grows to LIFT_SCALE over this long, from the slightly
 * pressed-in size CSS gives a held item, instead of popping.
 */
const LIFT_GROW_MS = 240;
const SETTLE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

type Slot = { id: string; el: HTMLElement; top: number; height: number };
type Drag = { id: string; startY: number; slots: Slot[]; from: number };

/** Where the lifted item lands and how far every item moves to make room. */
export function reorderTarget(slots: Slot[], from: number, delta: number) {
    const lifted = slots[from];
    const centre = lifted.top + lifted.height / 2 + delta;
    let to = from;
    slots.forEach((slot, index) => {
        const slotCentre = slot.top + slot.height / 2;
        if (index < from && centre < slotCentre) to--;
        if (index > from && centre > slotCentre) to++;
    });
    const neighbour = slots[from + 1] ?? slots[from - 1];
    const gap = neighbour
        ? neighbour.top > lifted.top
            ? neighbour.top - lifted.top - lifted.height
            : lifted.top - neighbour.top - neighbour.height
        : 0;
    const pitch = lifted.height + gap;
    const shifts = slots.map((_, index) => {
        if (index > from && index <= to) return -pitch;
        if (index >= to && index < from) return pitch;
        return 0;
    });
    const landing =
        to > from
            ? slots[to].top + slots[to].height - lifted.top - lifted.height
            : slots[to].top - lifted.top;
    return { to, shifts, landing };
}

/**
 * iOS-style reordering with no edit mode: long press lifts an item, the
 * others slide aside as it is dragged, and releasing drops it in place.
 * Like iOS context menus, letting go without moving calls `onHold`
 * instead (e.g. to show the item's menu); a lone item goes straight there.
 *
 * Movement is applied straight to the DOM in animation frames, so a drag
 * does not re-render the list; React only hears about crossings and the
 * final drop. Items need `data-reorder-id` inside `listRef`.
 */
export function useLongPressReorder({
    listRef,
    enabled,
    onLift,
    onReorder,
    onHold,
}: {
    listRef: RefObject<HTMLElement | null>;
    enabled: boolean;
    onLift?: () => void;
    onReorder: (id: string, to: number) => void;
    /** A long press released without dragging. */
    onHold?: (id: string) => void;
}) {
    const [liftedId, setLiftedId] = useState<string | null>(null);
    const [projection, setProjection] = useState<{
        from: number;
        to: number;
    } | null>(null);
    const timer = useRef<number | null>(null);
    const press = useRef<{
        x: number;
        y: number;
        id: string;
        el: HTMLElement;
    } | null>(null);
    const drag = useRef<Drag | null>(null);
    const delta = useRef(0);
    // The furthest the lifted item has been dragged, to tell a hold from a drag.
    const travel = useRef(0);
    const frame = useRef<number | null>(null);
    const liftedAt = useRef(0);
    const settleTimer = useRef<number | null>(null);
    const suppressClick = useRef(false);
    const onReorderRef = useRef(onReorder);
    const onLiftRef = useRef(onLift);
    const onHoldRef = useRef(onHold);
    useEffect(() => {
        onReorderRef.current = onReorder;
        onLiftRef.current = onLift;
        onHoldRef.current = onHold;
    });

    const cancelPress = useCallback(() => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        if (press.current) delete press.current.el.dataset.pressing;
        press.current = null;
    }, []);

    const resetStyles = useCallback((slots: Slot[]) => {
        slots.forEach(({ el }) => {
            el.style.transition = 'none';
            el.style.transform = '';
            delete el.dataset.reorderSettling;
        });
        // Re-enable CSS transitions once the reset has painted.
        requestAnimationFrame(() =>
            slots.forEach(({ el }) => el.style.removeProperty('transition')),
        );
    }, []);

    const paint = useCallback(function paintFrame() {
        frame.current = null;
        const current = drag.current;
        if (!current) return;
        const grown = Math.min(
            1,
            (performance.now() - liftedAt.current) / LIFT_GROW_MS,
        );
        // Ease out: quick at first, settling into the lifted size.
        const scale = 1 + (LIFT_SCALE - 1) * (1 - (1 - grown) ** 3);
        if (grown < 1) frame.current = requestAnimationFrame(paintFrame);
        const { to, shifts } = reorderTarget(
            current.slots,
            current.from,
            delta.current,
        );
        current.slots.forEach(({ el }, index) => {
            el.style.transform =
                index === current.from
                    ? `translateY(${delta.current}px) scale(${scale})`
                    : shifts[index]
                      ? `translateY(${shifts[index]}px)`
                      : '';
        });
        setProjection((previous) =>
            previous?.to === to ? previous : { from: current.from, to },
        );
    }, []);

    const drop = useCallback(() => {
        const current = drag.current;
        if (!current) return;
        drag.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        const { to, landing } = reorderTarget(
            current.slots,
            current.from,
            delta.current,
        );
        // Held and let go: the item settles back and its menu opens.
        if (travel.current <= MOVE_TOLERANCE) onHoldRef.current?.(current.id);
        const settleMs = window.matchMedia?.('(prefers-reduced-motion: reduce)')
            .matches
            ? 0
            : REORDER_SETTLE_MS;
        const lifted = current.slots[current.from].el;
        lifted.dataset.reorderSettling = 'true';
        lifted.style.transition = [
            `transform ${settleMs}ms ${SETTLE_EASING}`,
            `box-shadow ${settleMs}ms ease`,
            `background-color ${settleMs}ms ease`,
        ].join(', ');
        lifted.style.transform = `translateY(${landing}px)`;
        settleTimer.current = window.setTimeout(() => {
            settleTimer.current = null;
            // Commit the new order and clear the transforms in one frame,
            // so the items land exactly where they were drawn.
            flushSync(() => {
                if (to !== current.from) onReorderRef.current(current.id, to);
                setLiftedId(null);
                setProjection(null);
            });
            resetStyles(current.slots);
        }, settleMs);
    }, [resetStyles]);

    const lift = useCallback(
        (id: string, startY: number) => {
            const items = [
                ...(listRef.current?.querySelectorAll<HTMLElement>(
                    '[data-reorder-id]',
                ) ?? []),
            ];
            const slots = items.map((el) => {
                const bounds = el.getBoundingClientRect();
                return {
                    id: el.dataset.reorderId!,
                    el,
                    top: bounds.top,
                    height: bounds.height,
                };
            });
            const from = slots.findIndex((slot) => slot.id === id);
            if (from < 0) return;
            navigator.vibrate?.(10);
            suppressClick.current = true;
            // Nothing to reorder against: go straight to the menu.
            if (slots.length < 2) {
                onHoldRef.current?.(id);
                return;
            }
            delta.current = 0;
            travel.current = 0;
            liftedAt.current = window.matchMedia?.(
                '(prefers-reduced-motion: reduce)',
            ).matches
                ? -Infinity
                : performance.now();
            drag.current = { id, startY, slots, from };
            onLiftRef.current?.();
            setLiftedId(id);
            setProjection({ from, to: from });
            paint();
        },
        [listRef, paint],
    );

    useEffect(() => {
        if (!liftedId) return;
        const moveTo = (clientY: number) => {
            const current = drag.current;
            if (!current) return;
            delta.current = clientY - current.startY;
            travel.current = Math.max(travel.current, Math.abs(delta.current));
            frame.current ??= requestAnimationFrame(paint);
        };
        const onTouchMove = (event: TouchEvent) => {
            if (!drag.current || event.touches.length !== 1) return;
            // Hold the page still while the item follows the finger.
            if (event.cancelable) event.preventDefault();
            moveTo(event.touches[0].clientY);
        };
        // Touch drags use touch events; pointer events may be cancelled
        // once the browser considers scrolling.
        const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType !== 'touch') moveTo(event.clientY);
        };
        const onPointerEnd = (event: PointerEvent) => {
            if (event.pointerType !== 'touch') drop();
        };
        document.addEventListener('touchmove', onTouchMove, {
            passive: false,
            capture: true,
        });
        document.addEventListener('touchend', drop, true);
        document.addEventListener('touchcancel', drop, true);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerEnd);
        document.addEventListener('pointercancel', onPointerEnd);
        return () => {
            document.removeEventListener('touchmove', onTouchMove, true);
            document.removeEventListener('touchend', drop, true);
            document.removeEventListener('touchcancel', drop, true);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerEnd);
            document.removeEventListener('pointercancel', onPointerEnd);
        };
    }, [liftedId, paint, drop]);

    // Abandon a press or drag when the list is disabled or unmounts.
    useEffect(() => {
        if (enabled) return;
        cancelPress();
        const current = drag.current;
        drag.current = null;
        if (current) {
            resetStyles(current.slots);
            setLiftedId(null);
            setProjection(null);
        }
    }, [enabled, cancelPress, resetStyles]);
    useEffect(
        () => () => {
            cancelPress();
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            if (settleTimer.current !== null)
                window.clearTimeout(settleTimer.current);
        },
        [cancelPress],
    );

    /** Lifts the item being pressed, if any. */
    function liftPressed() {
        const current = press.current;
        cancelPress();
        if (current) lift(current.id, current.y);
        return Boolean(current);
    }

    /**
     * Lifts a pending press at once, for the system long press (Android's
     * `contextmenu`), which can come before LONG_PRESS_MS and would
     * otherwise end the press with nothing shown.
     */
    function holdNow() {
        return enabled && liftPressed();
    }

    /** Handlers for the element a long press should start from. */
    function pressProps(id: string) {
        return {
            onPointerDown(event: ReactPointerEvent<HTMLElement>) {
                suppressClick.current = false;
                if (!enabled || event.button !== 0 || drag.current) return;
                cancelPress();
                const startY = event.clientY;
                // `data-pressing` lets CSS show the hold building up (after
                // a short delay, so taps and scrolls never flash).
                const el =
                    event.currentTarget.closest<HTMLElement>(
                        '[data-reorder-id]',
                    ) ?? event.currentTarget;
                el.dataset.pressing = 'true';
                press.current = { x: event.clientX, y: startY, id, el };
                timer.current = window.setTimeout(liftPressed, LONG_PRESS_MS);
            },
            onPointerMove(event: ReactPointerEvent<HTMLElement>) {
                const start = press.current;
                if (
                    start &&
                    (Math.abs(event.clientX - start.x) > MOVE_TOLERANCE ||
                        Math.abs(event.clientY - start.y) > MOVE_TOLERANCE)
                )
                    cancelPress();
            },
            onPointerUp: cancelPress,
            onPointerCancel: cancelPress,
            onPointerLeave: cancelPress,
            // The release after a drag must not also open the item.
            onClickCapture(event: ReactMouseEvent<HTMLElement>) {
                if (!suppressClick.current) return;
                suppressClick.current = false;
                event.preventDefault();
                event.stopPropagation();
            },
        };
    }

    /** The position an item will take if the lifted item is dropped now. */
    function projectedIndex(index: number) {
        if (!projection) return index;
        const { from, to } = projection;
        if (index === from) return to;
        if (index > from && index <= to) return index - 1;
        if (index >= to && index < from) return index + 1;
        return index;
    }

    return { liftedId, pressProps, projectedIndex, holdNow };
}
