import { useRef, useState, type CSSProperties } from 'react';

/** Matches the `collection-row-exit` animation in SavedCollection.css. */
export const ROW_EXIT_MS = 180;

/**
 * Collapses rows before they leave a list: measure each row, play the shared
 * `collection-row-exiting` animation, then run `remove` to drop them.
 */
export function useRowExit<T extends HTMLElement = HTMLElement>() {
    const rows = useRef(new Map<string, T>());
    const [exiting, setExiting] = useState<Record<string, number>>({});

    function rowRef(id: string) {
        return (node: T | null) => {
            if (node) rows.current.set(id, node);
            else rows.current.delete(id);
        };
    }

    async function exitRows(ids: string[], remove: () => void) {
        const heights: Record<string, number> = Object.fromEntries(
            ids.flatMap((id) => {
                const row = rows.current.get(id);
                return row ? [[id, row.getBoundingClientRect().height]] : [];
            }),
        );
        const animated = Object.keys(heights);
        if (
            animated.length &&
            !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
            setExiting((current) => ({ ...current, ...heights }));
            await new Promise<void>((resolve) =>
                window.setTimeout(resolve, ROW_EXIT_MS),
            );
        }
        remove();
        setExiting((current) => {
            const next = { ...current };
            animated.forEach((id) => delete next[id]);
            return next;
        });
    }

    function exitClass(id: string | undefined) {
        return id && exiting[id] !== undefined ? ' collection-row-exiting' : '';
    }

    function exitStyle(id: string | undefined) {
        return id && exiting[id] !== undefined
            ? ({ '--exit-height': `${exiting[id]}px` } as CSSProperties)
            : undefined;
    }

    return { rowRef, exitRows, exitClass, exitStyle };
}
