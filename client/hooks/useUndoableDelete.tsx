import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useRowExit } from './useRowExit';
import { useUndoToast } from './useUndoToast';

type UndoableDeleteOptions = {
    /**
     * Deletes for real. Remove the rows from the list before resolving; any
     * row still in the list afterwards (failed or partial) reappears.
     */
    commit: (ids: string[]) => Promise<void>;
    /** Leaving the page commits a pending removal and drops its toast. */
    isActive?: boolean;
    /** Runs once rows have collapsed out of view, e.g. to reset swipe state. */
    onHidden?: (ids: string[]) => void;
};

/**
 * Optimistic list deletion: rows collapse at once (no server wait) and stay
 * hidden while the server catches up.
 * - `remove` shows an Undo toast and deletes only when it expires.
 * - `removeNow` is for already-confirmed deletes such as bulk delete.
 */
export function useUndoableDelete<T extends HTMLElement = HTMLElement>({
    commit,
    isActive = true,
    onHidden,
}: UndoableDeleteOptions) {
    const { rowRef, exitRows, exitClass, exitStyle } = useRowExit<T>();
    const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const { show, dismiss, undoToast } = useUndoToast();
    const pending = useRef<string[] | null>(null);
    const undone = useRef(new Set<string>());
    const commitRef = useRef(commit);
    const onHiddenRef = useRef(onHidden);
    useLayoutEffect(() => {
        commitRef.current = commit;
        onHiddenRef.current = onHidden;
    });

    const unhide = useCallback((ids: string[]) => {
        setHiddenIds((current) => {
            const next = new Set(current);
            ids.forEach((id) => next.delete(id));
            return next;
        });
    }, []);

    function hide(ids: string[]) {
        return exitRows(ids, () => {
            const leaving = ids.filter((id) => !undone.current.has(id));
            setHiddenIds((current) => new Set([...current, ...leaving]));
            onHiddenRef.current?.(leaving);
        });
    }

    const finish = useCallback(() => {
        const ids = pending.current;
        if (!ids) return;
        pending.current = null;
        dismiss();
        void commitRef
            .current(ids)
            .catch(() => undefined)
            .finally(() => unhide(ids));
    }, [unhide, dismiss]);

    useEffect(() => finish, [finish]);
    useEffect(() => {
        if (!isActive) finish();
    }, [isActive, finish]);

    function remove(ids: string[], message: string) {
        finish();
        pending.current = ids;
        ids.forEach((id) => undone.current.delete(id));
        show(message, undo, finish);
        void hide(ids);
    }

    function undo() {
        const ids = pending.current;
        if (!ids) return;
        pending.current = null;
        ids.forEach((id) => undone.current.add(id));
        dismiss();
        unhide(ids);
    }

    async function removeNow<R>(ids: string[], run: () => Promise<R>) {
        finish();
        ids.forEach((id) => undone.current.delete(id));
        await hide(ids);
        try {
            return await run();
        } finally {
            unhide(ids);
        }
    }

    return {
        rowRef,
        exitClass,
        exitStyle,
        hiddenIds,
        remove,
        removeNow,
        finish,
        undoToast,
    };
}
