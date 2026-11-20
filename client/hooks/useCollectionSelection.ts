import { useEffect, useRef, useState, type PointerEvent } from 'react';

export function useCollectionSelection<T>({
    items,
    visibleItems,
    getId,
    onOpen,
    onDelete,
    search,
    isActive,
    onSelectionStart,
}: {
    items: T[];
    visibleItems: T[];
    getId: (item: T) => string;
    onOpen: (item: T) => void;
    /** Removes the rows at once (with Undo); selection then ends. */
    onDelete: (ids: string[]) => void;
    search: string;
    isActive: boolean;
    onSelectionStart?: () => void;
}) {
    const [selection, setSelection] = useState<Set<string> | null>(null);
    const timer = useRef<number | null>(null);
    const pressStart = useRef<{ x: number; y: number } | null>(null);
    const suppressClick = useRef(false);
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
            onSelectionStart?.();
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
        endPress();
        setSelection(null);
    }
    function toggleSelection() {
        if (selecting) cancelSelection();
        else {
            onSelectionStart?.();
            setSelection(new Set());
        }
    }
    function toggleVisible() {
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
    function deleteSelected() {
        if (!selectedItems.length) return;
        onDelete(selectedItems.map(getId));
        cancelSelection();
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
