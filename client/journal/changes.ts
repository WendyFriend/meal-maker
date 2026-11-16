const listeners = new Set<(source?: symbol) => void>();

export function subscribeJournalChanges(listener: (source?: symbol) => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function notifyJournalChanged(source?: symbol) {
    listeners.forEach((listener) => listener(source));
}
