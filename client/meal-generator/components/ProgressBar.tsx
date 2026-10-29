// A thin indeterminate progress bar shown while a request is in flight.
//
// Deliberately indeterminate: the work is "parse the sentence, then ask a model
// for a recipe", which has no measurable percentage. A bar that invents one
// would be lying about the remaining time; a sweeping bar honestly says "working".
//
// It also holds a minimum visible time, because a fast response otherwise
// flashes the bar for a few frames, which reads as a glitch rather than as
// feedback.
import { useEffect, useRef, useState } from 'react';
import './ProgressBar.css';

/** How long the bar stays up once shown, so it never flickers. */
const MIN_VISIBLE_MS = 450;

export type ProgressBarProps = {
    active: boolean;
    /** Announced to screen readers while active. */
    label?: string;
};

function ProgressBar({ active, label = 'Working' }: ProgressBarProps) {
    // `visible` is derived from `active` except for the short hold after it goes
    // false. Tracking only the hold keeps the state change inside a timer
    // callback rather than synchronously in an effect.
    const [holding, setHolding] = useState(false);
    const shownAt = useRef(0);
    const wasActive = useRef(active);

    useEffect(() => {
        if (active) {
            wasActive.current = true;
            shownAt.current = performance.now();
            return;
        }

        if (!wasActive.current) return;
        wasActive.current = false;

        const elapsed = performance.now() - shownAt.current;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

        const start = window.setTimeout(() => setHolding(true), remaining);
        return () => window.clearTimeout(start);
    }, [active]);

    // Drop the hold as soon as activity resumes.
    useEffect(() => {
        if (!active || !holding) return;
        const clear = window.setTimeout(() => setHolding(false), 0);
        return () => window.clearTimeout(clear);
    }, [active, holding]);

    const visible = active || holding;

    return (
        <div
            className={`progress-bar${visible ? ' is-active' : ''}`}
            role="progressbar"
            aria-label={label}
            aria-hidden={!visible}
        >
            <span className="progress-bar-track">
                <span className="progress-bar-fill" />
            </span>
        </div>
    );
}

export default ProgressBar;
