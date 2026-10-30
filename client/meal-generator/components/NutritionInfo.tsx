import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { positionPopover } from '../../utils/positionPopover';
import './NutritionInfo.css';

export default function NutritionInfo({
    children,
    trigger,
    triggerClassName = 'nutrition-info-button',
    label = 'About vitamins and minerals',
}: {
    children: ReactNode;
    trigger?: ReactNode;
    triggerClassName?: string;
    label?: string;
}) {
    const id = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const position = useCallback(() => {
        const panel = popoverRef.current;
        const trigger = triggerRef.current;
        if (panel && trigger && panel.matches(':popover-open')) {
            positionPopover(panel, trigger, {
                width: 300,
                maxHeight: 280,
                gap: 8,
            });
            panel.style.visibility = 'visible';
        }
    }, []);

    useEffect(() => {
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => {
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
        };
    }, [position]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={triggerClassName}
                popoverTarget={id}
                aria-label={label}
            >
                {trigger ?? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v6" />
                        <circle
                            cx="12"
                            cy="7.5"
                            r=".8"
                            className="nutrition-info-dot"
                        />
                    </svg>
                )}
            </button>
            <div
                ref={popoverRef}
                id={id}
                popover="auto"
                role="dialog"
                aria-label={label}
                className="nutrition-info-popover"
                onBeforeToggle={(event) => {
                    // Native toggle events are queued: don't paint the panel
                    // at its default position while waiting for placement.
                    event.currentTarget.style.visibility = 'hidden';
                }}
                onToggle={position}
            >
                {children}
            </div>
        </>
    );
}
