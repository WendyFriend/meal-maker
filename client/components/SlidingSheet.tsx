import {
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../hooks/useModalDialog';
import './SlidingSheet.css';

type SlidingSheetProps = {
    children: ReactNode;
    id?: string;
    onClose: () => void;
    label?: string;
    labelledBy?: string;
    className?: string;
    header?: ReactNode;
    dismissible?: boolean;
};

const CLOSE_MS = 300;
/** A quick downward flick closes even when the drag was short (px/ms). */
const FLICK_VELOCITY = 0.5;

/** The nearest scrolled content between the touch and the sheet, if any. */
function scrolledAbove(target: EventTarget | null, sheet: HTMLElement) {
    for (
        let element = target instanceof Element ? target : null;
        element && element !== sheet;
        element = element.parentElement
    ) {
        if (
            element.scrollTop > 0 &&
            element.scrollHeight > element.clientHeight
        )
            return true;
    }
    return sheet.scrollTop > 0;
}

/**
 * Native modal sheet. Drag the handle, or pull the content down from the top
 * (as on iOS), to close; content otherwise keeps its own scroll gestures.
 */
export default function SlidingSheet({
    children,
    id,
    onClose,
    label,
    labelledBy,
    className = '',
    header,
    dismissible = true,
}: SlidingSheetProps) {
    const panelRef = useModalDialog();
    const drag = useRef<{
        pointerId: number;
        startY: number;
        offset: number;
        lastY: number;
        lastTime: number;
        velocity: number;
    } | null>(null);
    const suppressClick = useRef(false);
    const closing = useRef(false);
    const delivered = useRef(false);
    const [offset, setOffset] = useState(0);
    const [phase, setPhase] = useState<
        'idle' | 'dragging' | 'settling' | 'closing'
    >('idle');
    const [interacted, setInteracted] = useState(false);
    const offsetRef = useRef(0);
    const settleRef = useRef<
        (offset: number, velocity: number, cancelled?: boolean) => void
    >(() => {});

    function finishClose() {
        if (delivered.current) return;
        delivered.current = true;
        onClose();
    }

    // Fallback also handles a transition interrupted by resizing or a browser change.
    useEffect(() => {
        if (phase !== 'closing') return;
        const timer = window.setTimeout(() => {
            if (!delivered.current) {
                delivered.current = true;
                onClose();
            }
        }, CLOSE_MS + 60);
        return () => window.clearTimeout(timer);
    }, [phase, onClose]);

    function move(next: number) {
        offsetRef.current = next;
        setOffset(next);
    }

    function dismiss() {
        if (!dismissible || closing.current) return;
        closing.current = true;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishClose();
            return;
        }
        setInteracted(true);
        move(
            window.innerHeight -
                (panelRef.current?.getBoundingClientRect().top ?? 0) +
                offsetRef.current +
                16,
        );
        setPhase('closing');
    }

    /** Ends a drag: far enough or flicked closes, otherwise springs back. */
    function settle(dragged: number, velocity: number, cancelled = false) {
        const height = panelRef.current?.getBoundingClientRect().height ?? 0;
        const threshold = Math.min(120, Math.max(60, height * 0.2));
        if (
            !cancelled &&
            (dragged >= threshold ||
                (dragged > 16 && velocity > FLICK_VELOCITY))
        )
            dismiss();
        else {
            move(0);
            setPhase('settling');
        }
    }

    useEffect(() => {
        settleRef.current = settle;
    });

    // Pulling the content down from the top moves the sheet. Native listeners,
    // so the move can stop the page from scrolling (React's are passive).
    useEffect(() => {
        const sheet = panelRef.current;
        if (!sheet || !dismissible) return;
        let gesture: {
            startX: number;
            startY: number;
            lastY: number;
            lastTime: number;
            velocity: number;
            dragging: boolean;
        } | null = null;

        function start(event: TouchEvent) {
            gesture = null;
            const touch = event.touches[0];
            if (
                event.touches.length !== 1 ||
                closing.current ||
                (event.target instanceof Element &&
                    event.target.closest('.sliding-sheet-handle')) ||
                scrolledAbove(event.target, sheet!)
            )
                return;
            gesture = {
                startX: touch.clientX,
                startY: touch.clientY,
                lastY: touch.clientY,
                lastTime: event.timeStamp,
                velocity: 0,
                dragging: false,
            };
        }

        function track(event: TouchEvent) {
            const touch = event.touches[0];
            if (!gesture || !touch) return;
            const dy = touch.clientY - gesture.startY;
            if (!gesture.dragging) {
                const dx = Math.abs(touch.clientX - gesture.startX);
                if (Math.abs(dy) < 6 && dx < 6) return;
                // Scrolling up or sideways belongs to the content.
                if (dy <= 0 || dx > dy) {
                    gesture = null;
                    return;
                }
                gesture.dragging = true;
                gesture.startY = touch.clientY;
                setInteracted(true);
                setPhase('dragging');
            }
            event.preventDefault();
            const elapsed = event.timeStamp - gesture.lastTime;
            if (elapsed > 0)
                gesture.velocity = (touch.clientY - gesture.lastY) / elapsed;
            gesture.lastY = touch.clientY;
            gesture.lastTime = event.timeStamp;
            move(Math.max(0, touch.clientY - gesture.startY));
        }

        function end(event: TouchEvent) {
            const finished = gesture;
            gesture = null;
            if (!finished?.dragging) return;
            // A pause before letting go is not a flick.
            const still = event.timeStamp - finished.lastTime > 80;
            settleRef.current(
                offsetRef.current,
                still ? 0 : finished.velocity,
                event.type === 'touchcancel',
            );
        }

        sheet.addEventListener('touchstart', start, { passive: true });
        sheet.addEventListener('touchmove', track, { passive: false });
        sheet.addEventListener('touchend', end);
        sheet.addEventListener('touchcancel', end);
        return () => {
            sheet.removeEventListener('touchstart', start);
            sheet.removeEventListener('touchmove', track);
            sheet.removeEventListener('touchend', end);
            sheet.removeEventListener('touchcancel', end);
        };
    }, [panelRef, dismissible]);

    function startDrag(event: PointerEvent<HTMLButtonElement>) {
        if (
            !dismissible ||
            closing.current ||
            !event.isPrimary ||
            event.button !== 0
        )
            return;
        suppressClick.current = false;
        drag.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            offset: 0,
            lastY: event.clientY,
            lastTime: event.timeStamp,
            velocity: 0,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setInteracted(true);
        setPhase('dragging');
    }

    function moveDrag(event: PointerEvent<HTMLButtonElement>) {
        const gesture = drag.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gesture.offset = Math.max(0, event.clientY - gesture.startY);
        if (Math.abs(event.clientY - gesture.startY) > 3)
            suppressClick.current = true;
        const elapsed = event.timeStamp - gesture.lastTime;
        if (elapsed > 0)
            gesture.velocity = (event.clientY - gesture.lastY) / elapsed;
        gesture.lastY = event.clientY;
        gesture.lastTime = event.timeStamp;
        move(gesture.offset);
    }

    function endDrag(
        event: PointerEvent<HTMLButtonElement>,
        cancelled = false,
    ) {
        const gesture = drag.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (cancelled) suppressClick.current = true;
        const still = event.timeStamp - gesture.lastTime > 80;
        settle(gesture.offset, still ? 0 : gesture.velocity, cancelled);
    }

    return createPortal(
        <dialog
            id={id}
            aria-modal="true"
            ref={panelRef}
            className={`sliding-sheet ${className}`}
            aria-label={label}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            data-phase={phase}
            data-interacted={interacted}
            style={{ '--sheet-offset': `${offset}px` } as CSSProperties}
            onCancel={(event) => {
                event.preventDefault();
                dismiss();
            }}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
                    dismiss();
            }}
            onTransitionEnd={(event) => {
                if (
                    phase === 'closing' &&
                    event.target === event.currentTarget &&
                    event.propertyName === 'transform'
                )
                    finishClose();
            }}
        >
            <div className="sliding-sheet-header">
                <button
                    type="button"
                    className="sliding-sheet-handle"
                    aria-label="Close sheet"
                    title="Drag down or click to close"
                    disabled={!dismissible || phase === 'closing'}
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={(event) => endDrag(event)}
                    onPointerCancel={(event) => endDrag(event, true)}
                    onLostPointerCapture={(event) => endDrag(event, true)}
                    onClick={(event) => {
                        if (suppressClick.current && event.detail !== 0) {
                            suppressClick.current = false;
                            return;
                        }
                        dismiss();
                    }}
                >
                    <span aria-hidden="true" />
                </button>
                {header}
            </div>
            {children}
        </dialog>,
        document.body,
    );
}
