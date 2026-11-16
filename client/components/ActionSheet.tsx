import './ActionSheet.css';

export type ActionSheetSymbol =
    'search' | 'camera' | 'scan' | 'edit' | 'recipe';

export function ActionSheetIcon({ symbol }: { symbol: ActionSheetSymbol }) {
    const path = {
        search: (
            <>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
            </>
        ),
        camera: (
            <>
                <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
                <circle cx="12" cy="13.5" r="3.2" />
            </>
        ),
        scan: (
            <>
                <path d="M4 8V5h4m8 0h4v3M4 16v3h4m8 0h4v-3M8 10h8m-8 4h8" />
            </>
        ),
        edit: (
            <>
                <path d="m4 20 4.4-1 11-11a2 2 0 0 0-2.8-2.8l-11 11L4 20Z" />
                <path d="m14.7 7.3 2.8 2.8" />
            </>
        ),
        recipe: (
            <>
                <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z" />
                <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
            </>
        ),
    }[symbol];
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {path}
        </svg>
    );
}

/** Sheet title with the sheet's own close ✕. */
export function ActionSheetHeading({
    id,
    title,
    closeLabel,
    onClose,
}: {
    id: string;
    title: string;
    closeLabel: string;
    onClose: () => void;
}) {
    return (
        <div className="action-sheet-heading">
            <h2 id={id}>{title}</h2>
            <button type="button" aria-label={closeLabel} onClick={onClose}>
                ×
            </button>
        </div>
    );
}

/** A card of tappable choices, each with an icon and a trailing chevron. */
export function ActionSheetOptions<T extends string>({
    options,
    onChoose,
}: {
    options: { id: T; label: string; symbol: ActionSheetSymbol }[];
    onChoose: (id: T) => void;
}) {
    return (
        <div className="action-sheet-options">
            {options.map(({ id, label, symbol }) => (
                <button key={id} type="button" onClick={() => onChoose(id)}>
                    <span className="action-sheet-option-icon">
                        <ActionSheetIcon symbol={symbol} />
                    </span>
                    <span>{label}</span>
                    <span
                        className="action-sheet-option-chevron"
                        aria-hidden="true"
                    >
                        ›
                    </span>
                </button>
            ))}
        </div>
    );
}
