import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../hooks/useModalDialog';
import './ComingSoonDialog.css';

export default function ComingSoonDialog({
    message,
    onClose,
}: {
    message: string;
    onClose: () => void;
}) {
    const dialogRef = useModalDialog();
    const titleId = useId();

    return createPortal(
        <dialog
            ref={dialogRef}
            className="coming-soon-dialog"
            aria-labelledby={titleId}
            tabIndex={-1}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <h2 id={titleId}>{message}</h2>
            <button type="button" onClick={onClose}>
                Got it
            </button>
        </dialog>,
        document.body,
    );
}
