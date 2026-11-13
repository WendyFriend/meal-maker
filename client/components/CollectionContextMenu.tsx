import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './CollectionContextMenu.css';

export default function CollectionContextMenu({
    name,
    x,
    y,
    trigger,
    onEdit,
    onDelete,
    onClose,
    canDelete = true,
}: {
    name: string;
    x: number;
    y: number;
    trigger: HTMLElement | null;
    onEdit?: () => void;
    onDelete: () => void;
    onClose: () => void;
    canDelete?: boolean;
}) {
    const menuRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        menuRef.current
            ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
            ?.focus({ preventScroll: true });
    }, [name, x, y]);

    useEffect(() => {
        function closeOnOutsidePointer(event: PointerEvent) {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        }
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onClose();
            trigger?.focus({ preventScroll: true });
        }
        function closeMenu() {
            onClose();
        }
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        window.addEventListener('scroll', closeMenu, true);
        window.addEventListener('resize', closeMenu);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
            window.removeEventListener('scroll', closeMenu, true);
            window.removeEventListener('resize', closeMenu);
        };
    }, [onClose, trigger]);

    return createPortal(
        <div
            ref={menuRef}
            className="collection-context-menu"
            role="menu"
            aria-label={`${name} actions`}
            style={{ left: x, top: y }}
            onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
                    return;
                event.preventDefault();
                const items = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        '[role="menuitem"]',
                    ),
                );
                const current = items.indexOf(
                    document.activeElement as HTMLButtonElement,
                );
                const next =
                    (current +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        items.length) %
                    items.length;
                items[next]?.focus({ preventScroll: true });
            }}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    onClose();
            }}
        >
            {onEdit && (
                <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                        onClose();
                        onEdit();
                    }}
                >
                    Edit
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 20h4l11-11a2.1 2.1 0 0 0-4-4L4 16v4Z" />
                        <path d="m13.7 6.3 4 4" />
                    </svg>
                </button>
            )}
            {canDelete && (
                <>
                    {onEdit && (
                        <div
                            className="collection-context-separator"
                            role="separator"
                        />
                    )}
                    <button
                        type="button"
                        role="menuitem"
                        className="collection-context-delete"
                        onClick={() => {
                            onClose();
                            onDelete();
                        }}
                    >
                        Delete
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v6m4-6v6" />
                        </svg>
                    </button>
                </>
            )}
        </div>,
        document.body,
    );
}
