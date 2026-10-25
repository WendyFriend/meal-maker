import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Newer Node versions define their own `localStorage`, which is undefined
// without --localstorage-file and hides jsdom's. Provide an in-memory one.
if (typeof globalThis.localStorage?.getItem !== 'function') {
    const store = new Map<string, string>();
    const memoryStorage: Storage = {
        get length() {
            return store.size;
        },
        clear: () => store.clear(),
        getItem: (key) => store.get(key) ?? null,
        key: (index) => [...store.keys()][index] ?? null,
        removeItem: (key) => void store.delete(key),
        setItem: (key, value) => void store.set(key, String(value)),
    };

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: memoryStorage,
    });
}

afterEach(() => {
    cleanup();
});
