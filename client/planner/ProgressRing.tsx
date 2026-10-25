import type { ReactNode } from 'react';
import { getProgressTone } from './budget';

type ProgressRingProps = {
    value: number;
    max: number;
    size: number;
    strokeWidth: number;
    children?: ReactNode;
    className?: string;
};

/* Circular progress; `children` sit in the middle. Decorative: callers put
   the numbers in text. */
export default function ProgressRing({
    value,
    max,
    size,
    strokeWidth,
    children,
    className = '',
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

    return (
        <span
            className={`progress-ring progress-ring-${getProgressTone(value, max)} ${className}`}
            style={{ width: size, height: size }}
        >
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                aria-hidden="true"
                focusable="false"
            >
                <circle
                    className="progress-ring-track"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                />
                <circle
                    className="progress-ring-fill"
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - ratio)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            {children && (
                <span className="progress-ring-content">{children}</span>
            )}
        </span>
    );
}
