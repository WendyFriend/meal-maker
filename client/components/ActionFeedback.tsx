import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import './ActionFeedback.css';
import { useModalDialog } from '../hooks/useModalDialog';

/** Shared, short-lived confirmation for completed actions. */
export default function ActionFeedback({
    message,
    onClose,
}: {
    message: string;
    onClose: () => void;
}) {
    const panelRef = useModalDialog();
    const titleId = useId();
    useEffect(() => {
        const timer = window.setTimeout(onClose, 1800);
        return () => {
            window.clearTimeout(timer);
        };
    }, [onClose]);
    return createPortal(
        <dialog
            ref={panelRef}
            className="action-feedback"
            tabIndex={-1}
            aria-labelledby={titleId}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={onClose}
        >
            <span className="action-feedback-symbol" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path d="m5 12 4 4L19 6" />
                </svg>
            </span>
            <p id={titleId} role="status">
                {message}
            </p>
        </dialog>,
        document.body,
    );
}
