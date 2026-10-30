import SelectIcon from './SelectIcon';
import './EditIcon.css';
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
    const label = selecting ? 'Cancel selection' : `Select ${noun}s`;
    return (
        <button
            type="button"
            className="collection-selection-toggle edit-icon-button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
        >
            {selecting ? (
                <span className="collection-cancel-icon" aria-hidden="true">
                    ✕
                </span>
            ) : (
                <SelectIcon />
            )}
        </button>
    );
}

export function SelectionControls({
    count,
    allVisibleSelected,
    label,
    disabled,
    onToggle,
}: {
    count: number;
    allVisibleSelected: boolean;
    label: string;
    disabled: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="collection-selection-controls">
            <span role="status" aria-live="polite" aria-atomic="true">
                {count} selected
            </span>
            <button
                type="button"
                onClick={onToggle}
                aria-label={label}
                title={label}
                aria-pressed={allVisibleSelected}
                disabled={disabled}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16 4H6a2 2 0 0 0-2 2v10" />
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path
                        d={allVisibleSelected ? 'M11 14h6' : 'm11 14 2 2 4-4'}
                    />
                </svg>
            </button>
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
    return (
        <div
            className="collection-bulk-toolbar"
            role="group"
            aria-label={`Bulk ${noun} actions`}
        >
            {error && <p role="alert">{error}</p>}
            <button
                type="button"
                className="collection-bulk-delete"
                disabled={deleting || count === 0}
                onClick={onDelete}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
                </svg>
                {deleting
                    ? 'Deleting…'
                    : `Delete ${count} ${noun}${count === 1 ? '' : 's'}`}
            </button>
        </div>
    );
}
