import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import './SwipeableCollectionRow.css';

const REVEAL_WIDTH = 80;

type Gesture = {
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    dragging: boolean;
};

export default function SwipeableCollectionRow({
    children,
    name,
    enabled,
    open,
    onOpen,
    onClose,
    onDelete,
}: {
    children: ReactNode;
    name: string;
    enabled: boolean;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    /** Removes the row at once (see useUndoableDelete); it animates out. */
    onDelete: () => void;
}) {
    const gesture = useRef<Gesture | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const suppressClick = useRef(false);
    const removeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!enabled || !open) return;
        function closeWhenOutside(event: Event) {
            if (!rowRef.current?.contains(event.target as Node)) onClose();
        }
        document.addEventListener('pointerdown', closeWhenOutside, true);
        document.addEventListener('focusin', closeWhenOutside);
        return () => {
            document.removeEventListener('pointerdown', closeWhenOutside, true);
            document.removeEventListener('focusin', closeWhenOutside);
        };
    }, [enabled, open, onClose]);

    function offset(event: PointerEvent<HTMLDivElement>, current: Gesture) {
        return Math.min(
            0,
            Math.max(
                -REVEAL_WIDTH,
                current.startOffset + event.clientX - current.startX,
            ),
        );
    }

    function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
        const current = gesture.current;
        if (!current || event.pointerId !== current.pointerId) return;
        gesture.current = null;
        event.currentTarget.removeAttribute('data-dragging');
        rowRef.current?.style.removeProperty('--swipe-offset');
        if (!current.dragging) return;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (cancelled) return;
        if (offset(event, current) <= -REVEAL_WIDTH / 2) onOpen();
        else onClose();
        suppressClick.current = true;
        window.setTimeout(() => {
            suppressClick.current = false;
        }, 0);
    }

    return (
        <div
            ref={rowRef}
            className="saved-collection-swipe"
            data-open={enabled && open}
            data-enabled={enabled}
            tabIndex={enabled ? 0 : -1}
            aria-label={
                enabled
                    ? `${name}, swipe left or press Left Arrow to reveal Delete`
                    : undefined
            }
            onKeyDown={(event) => {
                if (!enabled) return;
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
                }
            }}
        >
            <button
                ref={removeButton}
                type="button"
                className="saved-collection-swipe-delete"
                aria-label={`Delete ${name}`}
                title={`Delete ${name}`}
                aria-hidden={!enabled || !open}
                tabIndex={enabled && open ? 0 : -1}
                disabled={!enabled}
                onClick={onDelete}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v6m4-6v6" />
                </svg>
            </button>
            <div
                className="saved-collection-swipe-content"
                onPointerDown={(event) => {
                    if (!enabled) return;
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
                    if (!enabled) {
                        gesture.current = null;
                        return;
                    }
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
                    // Set on the row so the Delete button can match the reveal.
                    rowRef.current?.style.setProperty(
                        '--swipe-offset',
                        `${offset(event, current)}px`,
                    );
                }}
                onPointerUp={(event) => finish(event)}
                onPointerCancel={(event) => finish(event, true)}
                onClickCapture={(event) => {
                    if (suppressClick.current) {
                        suppressClick.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    } else if (enabled && open) {
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
