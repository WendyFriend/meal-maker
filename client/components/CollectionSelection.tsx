import { useEffect, useId, useRef, useState } from 'react';
import './CollectionSelection.css';

export function SelectionToggle({
    selecting,
    disabled,
    noun,
    onClick,
}: {
    selecting: boolean;
    disabled: boolean;
    noun: string;
    onClick: () => void;
}) {
    const label = selecting ? 'Done' : 'Select';
    return (
        <button
            type="button"
            className="collection-selection-toggle"
            aria-label={selecting ? 'Cancel selection' : `Select ${noun}s`}
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

export function SelectionControls({
    visible,
    count,
    allVisibleSelected,
    label,
    disabled,
    onToggle,
}: {
    visible: boolean;
    count: number;
    allVisibleSelected: boolean;
    label: string;
    disabled: boolean;
    onToggle: () => void;
}) {
    return (
        <div
            className={`collection-selection-controls-slot${visible ? ' is-visible' : ''}`}
            aria-hidden={!visible}
            inert={!visible}
        >
            <div className="collection-selection-controls">
                <span role="status" aria-live="polite" aria-atomic="true">
                    {count} selected
                </span>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-pressed={allVisibleSelected}
                    disabled={disabled || !visible}
                >
                    {label}
                </button>
            </div>
        </div>
    );
}

export function SelectionIndicator({ selected }: { selected: boolean }) {
    return (
        <span
            className={`collection-selection-check${selected ? ' checked' : ''}`}
            aria-hidden="true"
        >
            {selected && (
                <svg viewBox="0 0 20 20">
                    <path d="m5 10 3 3 7-7" />
                </svg>
            )}
        </span>
    );
}

export function BulkDeleteToolbar({
    count,
    noun,
    deleting,
    error,
    onDelete,
}: {
    count: number;
    noun: string;
    deleting: boolean;
    error?: string;
    onDelete: () => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const deleteRef = useRef<HTMLButtonElement>(null);
    const wasConfirming = useRef(false);
    const confirmationId = useId();
    useEffect(() => {
        if (confirming) {
            cancelRef.current?.focus();
            wasConfirming.current = true;
        } else if (wasConfirming.current) {
            deleteRef.current?.focus();
            wasConfirming.current = false;
        }
    }, [confirming]);
    const deleteLabel = `Delete ${count} ${noun}${count === 1 ? '' : 's'}`;
    return (
        <div
            className="collection-bulk-toolbar"
            role="group"
            aria-label={`Bulk ${noun} actions`}
            aria-describedby={confirming ? confirmationId : undefined}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && confirming) {
                    event.preventDefault();
                    event.stopPropagation();
                    setConfirming(false);
                }
            }}
        >
            {error && <p role="alert">{error}</p>}
            {confirming ? (
                <div className="collection-bulk-confirm-row">
                    <p
                        id={confirmationId}
                        className="collection-bulk-confirmation"
                    >
                        {deleteLabel}?
                    </p>
                    <div className="collection-bulk-confirm-actions">
                        <button
                            ref={cancelRef}
                            type="button"
                            className="collection-bulk-cancel"
                            aria-label="Cancel delete"
                            title="Cancel delete"
                            disabled={deleting}
                            onClick={() => setConfirming(false)}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M6 6l12 12M18 6 6 18" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="collection-bulk-confirm"
                            aria-label={`Confirm ${deleteLabel.toLowerCase()}`}
                            title={`Confirm ${deleteLabel.toLowerCase()}`}
                            disabled={deleting || count === 0}
                            onClick={() => {
                                setConfirming(false);
                                onDelete();
                            }}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m4.5 12 5 5 10-10" />
                            </svg>
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    ref={deleteRef}
                    type="button"
                    className="collection-bulk-delete"
                    disabled={deleting || count === 0}
                    onClick={() => setConfirming(true)}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
                    </svg>
                    {deleting ? 'Deleting…' : deleteLabel}
                </button>
            )}
        </div>
    );
}
