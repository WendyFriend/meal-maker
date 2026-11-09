import { vi } from 'vitest';

// jsdom does not implement native dialog presentation or media query changes.
// Browser checks cover the native modal/top-layer behavior separately.
export function mockPickerEnvironment(initialMobile = false) {
    const captures = new WeakMap<HTMLElement, Set<number>>();
    Object.defineProperties(HTMLElement.prototype, {
        setPointerCapture: {
            configurable: true,
            writable: true,
            value: function (this: HTMLElement, pointerId: number) {
                const ids = captures.get(this) ?? new Set<number>();
                ids.add(pointerId);
                captures.set(this, ids);
            },
        },
        releasePointerCapture: {
            configurable: true,
            writable: true,
            value: function (this: HTMLElement, pointerId: number) {
                captures.get(this)?.delete(pointerId);
            },
        },
        hasPointerCapture: {
            configurable: true,
            writable: true,
            value: function (this: HTMLElement, pointerId: number) {
                return captures.get(this)?.has(pointerId) ?? false;
            },
        },
    });
    let mobile = initialMobile;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
            get matches() {
                return query.includes('640px') && mobile;
            },
            media: query,
            addEventListener: (_event: string, listener: () => void) =>
                listeners.add(listener),
            removeEventListener: (_event: string, listener: () => void) =>
                listeners.delete(listener),
        })),
    );
    for (const method of ['show', 'showModal'] as const) {
        Object.defineProperty(HTMLDialogElement.prototype, method, {
            configurable: true,
            value: vi.fn(function (this: HTMLDialogElement) {
                this.setAttribute('open', '');
            }),
        });
    }
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
            this.removeAttribute('open');
        }),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
    });
    return (nextMobile: boolean) => {
        mobile = nextMobile;
        listeners.forEach((listener) => listener());
    };
}
