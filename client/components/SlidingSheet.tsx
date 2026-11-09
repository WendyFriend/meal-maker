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

/** Native modal sheet with a draggable handle; content keeps its own scroll gestures. */
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
    } | null>(null);
    const suppressClick = useRef(false);
    const closing = useRef(false);
    const delivered = useRef(false);
    const [offset, setOffset] = useState(0);
    const [phase, setPhase] = useState<
        'idle' | 'dragging' | 'settling' | 'closing'
    >('idle');
    const [interacted, setInteracted] = useState(false);

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
        }, 240);
        return () => window.clearTimeout(timer);
    }, [phase, onClose]);

    function dismiss() {
        if (!dismissible || closing.current) return;
        closing.current = true;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finishClose();
            return;
        }
        setInteracted(true);
        setOffset(
            window.innerHeight -
                (panelRef.current?.getBoundingClientRect().top ?? 0) +
                offset +
                16,
        );
        setPhase('closing');
    }

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
        setOffset(gesture.offset);
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
        const height = panelRef.current?.getBoundingClientRect().height ?? 0;
        const threshold = Math.min(120, Math.max(60, height * 0.2));
        if (!cancelled && gesture.offset >= threshold) dismiss();
        else {
            setOffset(0);
            setPhase('settling');
            if (cancelled) suppressClick.current = true;
        }
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
