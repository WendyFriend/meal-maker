// A number that animates to its new value.
//
// Nutrition figures are the main thing on the result screen, so having them
// count up makes the result feel like it arrived rather than snapped into
// existence. The interpolation is time-based and eased, so a slow frame does not
// stretch the animation and a fast machine does not sprint it.
import { useEffect, useRef, useState } from 'react';

/** Duration of the count-up. */
const DURATION_MS = 620;

/** Cubic ease-out: fast at the start, settling at the end. */
function easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

export type AnimatedNumberProps = {
    value: number;
    /** Decimal places to show. Defaults to 0. */
    digits?: number;
};

function AnimatedNumber({ value, digits = 0 }: AnimatedNumberProps) {
    // Reduced motion is read once: it is a device preference, not something that
    // flips mid-animation, and reading it in the effect body would mean calling
    // setState synchronously there.
    const [still] = useState(prefersReducedMotion);
    // Start at zero so the first paint animates up to the real value; a value
    // that is already there on mount would never be seen as "arriving".
    const [shown, setShown] = useState(() => (still ? value : 0));
    const frameRef = useRef(0);
    // The value the previous animation ended on, so a mid-flight change starts
    // from what is actually on screen rather than jumping back.
    const fromRef = useRef(shown);

    useEffect(() => {
        if (still) return;

        const from = fromRef.current;
        const to = value;
        if (from === to) return;

        const began = performance.now();

        const step = () => {
            const elapsed = performance.now() - began;
            const t = Math.min(1, elapsed / DURATION_MS);
            const next = from + (to - from) * easeOut(t);
            setShown(next);
            fromRef.current = next;

            if (t < 1) {
                frameRef.current = requestAnimationFrame(step);
            } else {
                // Land exactly on the target: floating point drift otherwise
                // leaves the display a tenth off.
                fromRef.current = to;
                setShown(to);
            }
        };

        frameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frameRef.current);
    }, [still, value]);

    // Reduced motion shows the real number immediately.
    const display = still ? value : shown;

    return <>{display.toFixed(digits)}</>;
}

export default AnimatedNumber;
