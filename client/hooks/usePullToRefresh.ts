import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Keep pull-to-refresh inside the app's scroll view, including on iOS PWAs. */
export function usePullToRefresh({
    enabled = true,
    disabled = false,
    refreshing,
    onRefresh,
}: {
    enabled?: boolean;
    disabled?: boolean;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    const containerRef = useRef<HTMLElement>(null);
    const [pullDistance, setPullDistance] = useState(0);
    const stateRef = useRef({ disabled, refreshing, onRefresh });
    useLayoutEffect(() => {
        stateRef.current = { disabled, refreshing, onRefresh };
    }, [disabled, refreshing, onRefresh]);

    useEffect(() => {
        const section = containerRef.current;
        const scroller = section?.closest<HTMLElement>('.page-transition');
        if (!section || !scroller || !enabled) return;

        let startY: number | null = null;
        let startX = 0;
        let distance = 0;
        let canRefresh = false;
        const onStart = (event: TouchEvent) => {
            const target = event.target;
            if (
                event.touches.length !== 1 ||
                scroller.scrollTop > 0 ||
                !(target instanceof Element) ||
                (!scroller.contains(target) && !target.closest('.page-header'))
            ) {
                startY = null;
                return;
            }
            startY = event.touches[0].clientY;
            startX = event.touches[0].clientX;
            canRefresh =
                !stateRef.current.disabled &&
                !stateRef.current.refreshing &&
                !target.closest('input, textarea, select');
        };
        const onMove = (event: TouchEvent) => {
            if (stateRef.current.disabled || stateRef.current.refreshing) {
                reset();
                return;
            }
            if (startY === null || !canRefresh || event.touches.length !== 1)
                return;
            const deltaY = event.touches[0].clientY - startY;
            const deltaX = event.touches[0].clientX - startX;
            if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
                distance = 0;
                setPullDistance(0);
                return;
            }
            if (event.cancelable) event.preventDefault();
            if (canRefresh) {
                distance = Math.min(76, deltaY * 0.48);
                setPullDistance(distance);
            }
        };
        const reset = () => {
            startY = null;
            distance = 0;
            canRefresh = false;
            setPullDistance(0);
        };
        const onEnd = () => {
            if (distance >= 56) stateRef.current.onRefresh();
            reset();
        };
        document.addEventListener('touchstart', onStart, {
            passive: true,
            capture: true,
        });
        document.addEventListener('touchmove', onMove, {
            passive: false,
            capture: true,
        });
        document.addEventListener('touchend', onEnd, true);
        document.addEventListener('touchcancel', reset, true);
        return () => {
            document.removeEventListener('touchstart', onStart, true);
            document.removeEventListener('touchmove', onMove, true);
            document.removeEventListener('touchend', onEnd, true);
            document.removeEventListener('touchcancel', reset, true);
        };
    }, [enabled]);

    return { containerRef, pullDistance };
}
