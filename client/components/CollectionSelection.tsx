import type { ReactNode } from 'react';
import CloseIcon from './CloseIcon';
import LoadingSpinner from './LoadingSpinner';
import Popover from './Popover';
import './CollectionSelection.css';

export function SelectionToggle({
    selecting,
    disabled,
    noun,
    onClick,
}: {
    selecting: boolean;
    disabled?: boolean;
    noun: string;
    onClick: () => void;
}) {
    // "Select" is a text action (no clear symbol); leaving the mode is ✕.
    return (
        <button
            type="button"
            className={`collection-selection-toggle${selecting ? ' collection-selection-toggle-cancel' : ''}`}
            aria-label={selecting ? 'Cancel selection' : `Select ${noun}s`}
            title={selecting ? 'Cancel selection' : undefined}
            disabled={disabled}
            onClick={onClick}
        >
            {selecting ? <CloseIcon /> : 'Select'}
        </button>
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

/**
 * The page title while selecting: "0 Selected", "2 Selected", in the same
 * place and style as the title it replaces, so nothing moves.
 */
export function CollectionTitle({
    id,
    title,
    selecting,
    count,
}: {
    id: string;
    title: string;
    selecting: boolean;
    count: number;
}) {
    return (
        <h1 id={id} className="collection-title">
            {selecting ? `${count} Selected` : title}
        </h1>
    );
}

type SelectionAction = {
    label: string;
    /** Inner content of a 24px SVG. */
    icon: ReactNode;
    busy?: boolean;
    onClick: () => void;
};

/**
 * Like Mail, Files and Photos: while selecting, the title row's icons are
 * replaced in place by Select All, the actions, Delete (confirmed from a
 * small menu on the trash icon) and ✕. Rows and the page never shift.
 */
export function SelectionActions({
    count,
    noun,
    allVisibleSelected,
    toggleAllLabel,
    selectableCount,
    actions = [],
    onToggleAll,
    onDelete,
    onCancel,
}: {
    count: number;
    noun: string;
    allVisibleSelected: boolean;
    /** "Select all", or "Select results" while searching. */
    toggleAllLabel: string;
    selectableCount: number;
    actions?: SelectionAction[];
    onToggleAll: () => void;
    onDelete: () => void;
    onCancel: () => void;
}) {
    const busy = actions.some((action) => action.busy);
    const deleteLabel = `Delete ${count} ${noun}${count === 1 ? '' : 's'}`;
    return (
        <div
            className="collection-selection-actions"
            role="toolbar"
            aria-label={`Selected ${noun} actions`}
        >
            <span className="collection-selection-status" role="status">
                {count} selected
            </span>
            <button
                type="button"
                className="collection-selection-icon"
                aria-label={toggleAllLabel}
                title={toggleAllLabel}
                aria-pressed={allVisibleSelected}
                disabled={busy || selectableCount === 0}
                onClick={onToggleAll}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m3.5 6.5 1.6 1.6 3-3.1M3.5 12.5l1.6 1.6 3-3.1M3.5 18.5l1.6 1.6 3-3.1M11 7h9.5M11 13h9.5M11 19h9.5" />
                </svg>
            </button>
            {actions.map((action) => (
                <button
                    key={action.label}
                    type="button"
                    className="collection-selection-icon"
                    aria-label={action.label}
                    title={action.label}
                    aria-busy={action.busy || undefined}
                    disabled={busy || count === 0}
                    onClick={action.onClick}
                >
                    {action.busy ? (
                        <LoadingSpinner size="small" tone="inherit" />
                    ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            {action.icon}
                        </svg>
                    )}
                </button>
            ))}
            <Popover
                trigger={
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
                    </svg>
                }
                triggerClassName="collection-selection-icon collection-selection-delete"
                triggerLabel={deleteLabel}
                triggerTitle="Delete"
                triggerDisabled={busy || count === 0}
                label={`${deleteLabel}?`}
                panelClassName="collection-delete-confirm"
                width={240}
            >
                {(close) => (
                    <button
                        type="button"
                        className="collection-delete-confirm-button"
                        aria-label={`Confirm ${deleteLabel.toLowerCase()}`}
                        onClick={() => {
                            close();
                            onDelete();
                        }}
                    >
                        {deleteLabel}
                    </button>
                )}
            </Popover>
            <SelectionToggle
                selecting
                disabled={busy}
                noun={noun}
                onClick={onCancel}
            />
        </div>
    );
}
