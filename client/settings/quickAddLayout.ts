import { useCallback, useEffect, useState } from 'react';

export const QUICK_ADD_LAYOUTS = ['tiles', 'rows'] as const;
export type QuickAddLayout = (typeof QUICK_ADD_LAYOUTS)[number];

const DEFAULT_LAYOUT: QuickAddLayout = 'tiles';
const STORAGE_KEY = 'meal-maker:quick-add-layout';
const CHANGE_EVENT = 'meal-maker:quick-add-layout-change';

function loadQuickAddLayout(): QuickAddLayout {
    if (!import.meta.env.DEV) return DEFAULT_LAYOUT;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return (
            QUICK_ADD_LAYOUTS.find((layout) => layout === stored) ??
            DEFAULT_LAYOUT
        );
    } catch {
        return DEFAULT_LAYOUT;
    }
}

function saveQuickAddLayout(layout: QuickAddLayout) {
    if (!import.meta.env.DEV) return;
    try {
        localStorage.setItem(STORAGE_KEY, layout);
    } catch {
        // The in-memory choice still works when storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: layout }));
}

export function useQuickAddLayout() {
    const [layout, setLayout] = useState(loadQuickAddLayout);

    useEffect(() => {
        function syncLayout(event: Event) {
            setLayout((event as CustomEvent<QuickAddLayout>).detail);
        }
        window.addEventListener(CHANGE_EVENT, syncLayout);
        return () => window.removeEventListener(CHANGE_EVENT, syncLayout);
    }, []);

    const updateLayout = useCallback((next: QuickAddLayout) => {
        setLayout(next);
        saveQuickAddLayout(next);
    }, []);

    return [layout, updateLayout] as const;
}
