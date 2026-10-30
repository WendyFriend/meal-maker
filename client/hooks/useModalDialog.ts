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
        panel.showModal();
        panel.focus({ preventScroll: true });
        for (const { element } of previous) element.style.overflow = 'hidden';
        return () => {
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
