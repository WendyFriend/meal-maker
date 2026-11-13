const listeners = new Set<() => void>();

export function subscribeJournalChanges(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function notifyJournalChanged() {
    listeners.forEach((listener) => listener());
}
