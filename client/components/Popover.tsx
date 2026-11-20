import {
    useCallback,
    useEffect,
    useId,
    useRef,
    type ReactNode,
    type RefObject,
} from 'react';
import { positionPopover } from '../utils/positionPopover';
import './Popover.css';

/**
 * A small panel anchored to its trigger. It uses the native `popover="auto"`
 * light dismiss, so tapping anywhere else or pressing Escape closes it.
 */
export default function Popover({
    trigger,
    triggerClassName,
    triggerLabel,
    triggerTitle,
    triggerRef,
    triggerDisabled,
    label,
    panelClassName,
    width = 300,
    maxHeight = 280,
    children,
}: {
    trigger: ReactNode;
    triggerClassName?: string;
    /** Only when the trigger has no visible text of its own. */
    triggerLabel?: string;
    /** Tooltip, for icon-only triggers. */
    triggerTitle?: string;
    triggerRef?: RefObject<HTMLButtonElement | null>;
    triggerDisabled?: boolean;
    /** Accessible name of the panel. */
    label: string;
    panelClassName?: string;
    width?: number;
    maxHeight?: number;
    /** Pass a function to get a `close` callback, e.g. for menu items. */
    children: ReactNode | ((close: () => void) => ReactNode);
}) {
    const id = useId();
    const ownTriggerRef = useRef<HTMLButtonElement | null>(null);
    const anchorRef = triggerRef ?? ownTriggerRef;
    const popoverRef = useRef<HTMLDivElement>(null);
    const position = useCallback(() => {
        const panel = popoverRef.current;
        const trigger = document.querySelector<HTMLElement>(
            `[popovertarget="${CSS.escape(id)}"]`,
        );
        if (panel && trigger && panel.matches(':popover-open')) {
            positionPopover(panel, trigger, { width, maxHeight, gap: 8 });
            panel.style.visibility = 'visible';
        }
    }, [id, width, maxHeight]);

    useEffect(() => {
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => {
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
        };
    }, [position]);

    const close = useCallback(() => {
        const panel = document.getElementById(id);
        if (panel?.matches(':popover-open')) panel.hidePopover();
    }, [id]);

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                className={triggerClassName}
                popoverTarget={id}
                aria-label={triggerLabel}
                title={triggerTitle}
                disabled={triggerDisabled}
            >
                {trigger}
            </button>
            <div
                ref={popoverRef}
                id={id}
                popover="auto"
                role="dialog"
                aria-label={label}
                className={`popover-panel${panelClassName ? ` ${panelClassName}` : ''}`}
                onBeforeToggle={(event) => {
                    // Native toggle events are queued: don't paint the panel
                    // at its default position while waiting for placement.
                    event.currentTarget.style.visibility = 'hidden';
                }}
                onToggle={position}
            >
                {typeof children === 'function' ? children(close) : children}
            </div>
        </>
    );
}
