import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Sheet.css';

type SheetProps = {
    title: string;
    // Small line under the title, e.g. the period's budget.
    subtitle?: string;
    onClose: () => void;
    children: ReactNode;
};

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Modal dialog on desktop, bottom sheet on phones. Escape or a click on the
   backdrop closes it; focus stays inside and returns to the opener. */
export default function Sheet({
    title,
    subtitle,
    onClose,
    children,
}: SheetProps) {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        const { overflow } = document.body.style;

        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            // Inner widgets (e.g. an open suggestion list) claim Escape first.
            if (event.key === 'Escape' && !event.defaultPrevented) {
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab' || !dialogRef.current) return;

            // Skip anything inside a hidden tab panel.
            const focusable = [
                ...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
            ].filter((element) => !element.closest('[hidden]'));

            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;

            if (
                event.shiftKey &&
                (active === first || active === dialogRef.current)
            ) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = overflow;
            opener?.focus?.();
        };
    }, []);

    return createPortal(
        <div
            className="sheet-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                className="sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <header className="sheet-header">
                    <div className="sheet-heading">
                        <h2 id={titleId}>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        className="sheet-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </header>
                <div className="sheet-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
