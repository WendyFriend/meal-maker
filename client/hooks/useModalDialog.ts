import { useEffect, useRef } from 'react';

/** Native modal focus and scroll ownership, restored on close or unmount. */
export function useModalDialog() {
    const panelRef = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const previousFocus = document.activeElement;
        const scrollers = [
            document.body,
            ...document.querySelectorAll<HTMLElement>('.page-transition'),
        ];
        const previous = scrollers.map((element) => ({
            element,
            overflow: element.style.overflow,
        }));
        function containTab(event: KeyboardEvent) {
            if (event.key !== 'Tab' || event.defaultPrevented) return;
            const controls = [
                ...panel!.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]',
                ),
            ].filter((element) => {
                const style = getComputedStyle(element);
                return (
                    element.tabIndex >= 0 &&
                    !element.matches(':disabled') &&
                    !element.closest('[hidden], [inert]') &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden'
                );
            });
            const first = controls[0];
            const last = controls.at(-1);
            const active = document.activeElement;
            if (!first || !last) {
                event.preventDefault();
                panel!.focus({ preventScroll: true });
            } else if (
                event.shiftKey &&
                (active === first || active === panel)
            ) {
                event.preventDefault();
                last.focus({ preventScroll: true });
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus({ preventScroll: true });
            }
        }
        panel.addEventListener('keydown', containTab);
        panel.showModal();
        panel.focus({ preventScroll: true });
        for (const { element } of previous) element.style.overflow = 'hidden';
        return () => {
            panel.removeEventListener('keydown', containTab);
            for (const { element, overflow } of previous)
                element.style.overflow = overflow;
            panel.close();
            // React may detach the dialog before native close restores focus.
            if (
                previousFocus instanceof HTMLElement &&
                previousFocus.isConnected &&
                !previousFocus.closest('[inert]')
            ) {
                previousFocus.focus({ preventScroll: true });
            }
        };
    }, []);
    return panelRef;
}
