import {
    useEffect,
    useRef,
    useState,
    type PointerEvent,
    type ReactNode,
} from 'react';
import './SwipeableIngredientRow.css';

const REVEAL_WIDTH = 84;
const REMOVE_DURATION = 230;

type Gesture = {
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    dragging: boolean;
};

export default function SwipeableIngredientRow({
    children,
    name,
    enabled,
    open,
    onOpen,
    onClose,
    onRemove,
}: {
    children: ReactNode;
    name: string;
    enabled: boolean;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    onRemove: () => void;
}) {
    const gesture = useRef<Gesture | null>(null);
    const suppressClick = useRef(false);
    const removeButton = useRef<HTMLButtonElement>(null);
    const row = useRef<HTMLDivElement>(null);
    const removeTimer = useRef<number | null>(null);
    const onRemoveRef = useRef(onRemove);
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        onRemoveRef.current = onRemove;
    }, [onRemove]);

    useEffect(
        () => () => {
            if (removeTimer.current !== null)
                window.clearTimeout(removeTimer.current);
        },
        [],
    );

    function requestRemoval() {
        if (removing) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            onRemove();
            return;
        }
        const height = row.current?.getBoundingClientRect().height || 64;
        row.current?.style.setProperty(
            '--ingredient-row-height',
            `${height}px`,
        );
        setRemoving(true);
        removeTimer.current = window.setTimeout(() => {
            removeTimer.current = null;
            onRemoveRef.current();
        }, REMOVE_DURATION);
    }

    function offsetFor(event: PointerEvent<HTMLDivElement>, current: Gesture) {
        return Math.min(
            0,
            Math.max(
                -REVEAL_WIDTH,
                current.startOffset + event.clientX - current.startX,
            ),
        );
    }

    function finishGesture(
        event: PointerEvent<HTMLDivElement>,
        cancelled = false,
    ) {
        const current = gesture.current;
        if (!current || event.pointerId !== current.pointerId) return;
        gesture.current = null;
        event.currentTarget.removeAttribute('data-dragging');
        event.currentTarget.style.removeProperty('--swipe-offset');
        if (!current.dragging) return;

        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (!cancelled) {
            if (offsetFor(event, current) <= -REVEAL_WIDTH / 2) onOpen();
            else onClose();
            suppressClick.current = true;
            window.setTimeout(() => {
                suppressClick.current = false;
            }, 0);
        }
    }

    if (!enabled) return <>{children}</>;

    return (
        <div
            ref={row}
            className="meal-ingredient-swipe"
            data-open={open}
            data-removing={removing}
            aria-busy={removing}
            tabIndex={0}
            aria-label={`${name}, swipe left or press Left Arrow to reveal Remove`}
            onKeyDown={(event) => {
                if (removing) return;
                if (event.key === 'Escape' || event.key === 'ArrowRight') {
                    onClose();
                    return;
                }
                if (event.target !== event.currentTarget) return;
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    onOpen();
                    window.requestAnimationFrame(() =>
                        removeButton.current?.focus({ preventScroll: true }),
                    );
                } else if (
                    event.key === 'Delete' ||
                    event.key === 'Backspace'
                ) {
                    event.preventDefault();
                    requestRemoval();
                }
            }}
        >
            <button
                ref={removeButton}
                type="button"
                className="meal-ingredient-swipe-remove"
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                disabled={removing}
                onClick={requestRemoval}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                </svg>
            </button>
            <div
                className="meal-ingredient-swipe-content"
                onPointerDown={(event) => {
                    if (removing) return;
                    if (event.pointerType === 'mouse' && event.button !== 0)
                        return;
                    gesture.current = {
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        startOffset: open ? -REVEAL_WIDTH : 0,
                        dragging: false,
                    };
                }}
                onPointerMove={(event) => {
                    const current = gesture.current;
                    if (!current || event.pointerId !== current.pointerId)
                        return;
                    const dx = event.clientX - current.startX;
                    const dy = event.clientY - current.startY;
                    if (!current.dragging) {
                        if (
                            Math.abs(dx) < 8 ||
                            Math.abs(dx) <= Math.abs(dy) * 1.2
                        )
                            return;
                        current.dragging = true;
                        event.currentTarget.setPointerCapture?.(
                            event.pointerId,
                        );
                        event.currentTarget.setAttribute(
                            'data-dragging',
                            'true',
                        );
                    }
                    event.preventDefault();
                    event.currentTarget.style.setProperty(
                        '--swipe-offset',
                        `${offsetFor(event, current)}px`,
                    );
                }}
                onPointerUp={(event) => finishGesture(event)}
                onPointerCancel={(event) => finishGesture(event, true)}
                onClickCapture={(event) => {
                    if (suppressClick.current) {
                        suppressClick.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    } else if (open) {
                        onClose();
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                {children}
            </div>
        </div>
    );
}
