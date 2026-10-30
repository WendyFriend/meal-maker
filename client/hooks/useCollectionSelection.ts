import { useEffect, useRef, useState, type PointerEvent } from 'react';

export function useCollectionSelection<T>({
    items,
    visibleItems,
    getId,
    onOpen,
    onDeleteMany,
    noun,
    search,
    isActive,
}: {
    items: T[];
    visibleItems: T[];
    getId: (item: T) => string;
    onOpen: (item: T) => void;
    onDeleteMany: (ids: string[]) => Promise<string[]>;
    noun: string;
    search: string;
    isActive: boolean;
}) {
    const [selection, setSelection] = useState<Set<string> | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string>();
    const timer = useRef<number | null>(null);
    const pressStart = useRef<{ x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
    const pending = useRef(false);
    const selecting = selection !== null;
    const selectedItems = items.filter((item) => selection?.has(getId(item)));
    const selectable = visibleItems.filter((item) => getId(item));
    const allVisibleSelected =
        selectable.length > 0 &&
        selectable.every((item) => selection?.has(getId(item)));
    const selectAllLabel = allVisibleSelected
        ? search.trim()
            ? 'Deselect results'
            : 'Deselect all'
        : search.trim()
          ? 'Select results'
          : 'Select all';

    function endPress() {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        pressStart.current = null;
    }
    function startPress(event: PointerEvent<HTMLButtonElement>, item: T) {
        if (
            event.button !== 0 ||
            event.isPrimary === false ||
            pending.current ||
            !isActive ||
            !getId(item)
        )
            return;
        endPress();
        suppressClick.current = false;
        if (selecting) return;
        pressStart.current = { x: event.clientX, y: event.clientY };
        timer.current = window.setTimeout(() => {
            suppressClick.current = true;
            setError(undefined);
            setSelection(new Set([getId(item)]));
            endPress();
        }, 500);
    }
    function movePress(event: PointerEvent<HTMLButtonElement>) {
        const start = pressStart.current;
        if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
        ) {
            suppressClick.current = true;
            endPress();
        }
    }
    function clickItem(item: T) {
        if (suppressClick.current) {
            suppressClick.current = false;
            return;
        }
        if (pending.current) return;
        if (!selecting) {
            onOpen(item);
            return;
        }
        const id = getId(item);
        if (!id) return;
        setSelection((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }
    function cancelSelection() {
        if (pending.current) return;
        endPress();
        setSelection(null);
        setError(undefined);
    }
    function toggleSelection() {
        if (selecting) cancelSelection();
        else {
            setError(undefined);
            setSelection(new Set());
        }
    }
    function toggleVisible() {
        if (pending.current) return;
        setSelection((current) => {
            const next = new Set(current);
            for (const item of selectable) {
                const id = getId(item);
                if (allVisibleSelected) next.delete(id);
                else next.add(id);
            }
            return next;
        });
    }
    async function deleteSelected() {
        if (!selectedItems.length || pending.current) return;
        const ids = selectedItems.map(getId);
        pending.current = true;
        setDeleting(true);
        setError(undefined);
        try {
            const deleted = new Set(await onDeleteMany(ids));
            const remaining = ids.filter((id) => !deleted.has(id));
            setSelection(remaining.length ? new Set(remaining) : null);
            if (remaining.length)
                setError(
                    `Some ${noun}s could not be deleted. Please try again.`,
                );
        } catch {
            setError(
                `Could not delete the selected ${noun}s. Please try again.`,
            );
        } finally {
            pending.current = false;
            setDeleting(false);
        }
    }
    useEffect(
        () => () => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            pressStart.current = null;
        },
        [isActive],
    );

    return {
        selecting,
        deleting,
        error,
        selectedItems,
        allVisibleSelected,
        selectAllLabel,
        isSelected: (item: T) => selection?.has(getId(item)) ?? false,
        selectableCount: selectable.length,
        startPress,
        movePress,
        endPress,
        clickItem,
        cancelSelection,
        toggleSelection,
        toggleVisible,
        deleteSelected,
        resetClickSuppression: () => {
            suppressClick.current = false;
        },
    };
}
