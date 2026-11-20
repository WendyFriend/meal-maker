import { useLayoutEffect, type RefObject } from 'react';

/**
 * Grows a one-line name `textarea` with its text, wrapping exactly like the
 * heading it replaces: sized by whole lines, refitted when its box resizes.
 */
export function useAutoGrowTextarea(
    ref: RefObject<HTMLTextAreaElement | null>,
    active: boolean,
    value: string,
) {
    useLayoutEffect(() => {
        const input = ref.current;
        if (!active || !input) return;
        const fit = () => {
            input.style.height = 'auto';
            // scrollHeight is rounded; size by whole lines so the field is
            // exactly as tall as the heading it replaces.
            const style = getComputedStyle(input);
            const lineHeight = parseFloat(style.lineHeight);
            const padding =
                parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            const lines = Math.max(
                1,
                Math.round((input.scrollHeight - padding) / lineHeight),
            );
            input.style.height = Number.isFinite(lines * lineHeight)
                ? `${lines * lineHeight + padding}px`
                : `${input.scrollHeight}px`;
        };
        fit();
        const observer =
            typeof ResizeObserver === 'undefined'
                ? undefined
                : new ResizeObserver(fit);
        observer?.observe(input.parentElement ?? input);
        return () => observer?.disconnect();
    }, [ref, active, value]);
}
