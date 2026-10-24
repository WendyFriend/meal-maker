import { vi } from 'vitest';

// jsdom does not implement native dialog presentation or media query changes.
// Browser checks cover the native modal/top-layer behavior separately.
export function mockPickerEnvironment(initialMobile = false) {
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
