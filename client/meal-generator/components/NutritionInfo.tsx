import type { ReactNode } from 'react';
import Popover from '../../components/Popover';
import './NutritionInfo.css';

/** An info popover for nutrition details; defaults to an ⓘ trigger. */
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
    return (
        <Popover
            trigger={
                trigger ?? (
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
                )
            }
            triggerClassName={triggerClassName}
            triggerLabel={label}
            label={label}
            panelClassName="nutrition-info-popover"
        >
            {children}
        </Popover>
    );
}
