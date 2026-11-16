import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import CheckIcon from './CheckIcon';
import './ActionToast.css';

type ActionToastColors = {
    background?: string;
    text?: string;
    iconBackground?: string;
    icon?: string;
};

type ActionToastProps = {
    message: string;
    icon?: ReactNode;
    placement?: 'inline' | 'floating';
    colors?: ActionToastColors;
    onClose?: () => void;
    durationMs?: number;
    /** Optional trailing action, such as Undo. Makes the toast tappable. */
    action?: { label: string; onClick: () => void };
};

/** Passive confirmation that can sit in a sheet or above app navigation. */
export default function ActionToast({
    message,
    icon = <CheckIcon />,
    placement = 'inline',
    colors,
    onClose,
    durationMs = 2400,
    action,
}: ActionToastProps) {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!onCloseRef.current) return;
        const timer = window.setTimeout(
            () => onCloseRef.current?.(),
            durationMs,
        );
        return () => window.clearTimeout(timer);
    }, [durationMs]);

    const style = {
        '--action-toast-background': colors?.background,
        '--action-toast-text': colors?.text,
        '--action-toast-icon-background': colors?.iconBackground,
        '--action-toast-icon': colors?.icon,
    } as CSSProperties;

    const toast = (
        <div
            className={`action-toast action-toast--${placement}${action ? ' action-toast--actionable' : ''}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={style}
        >
            {icon && (
                <span className="action-toast-symbol" aria-hidden="true">
                    {icon}
                </span>
            )}
            <span>{message}</span>
            {action && (
                <button
                    type="button"
                    className="action-toast-action"
                    onClick={action.onClick}
                >
                    {action.label}
                </button>
            )}
        </div>
    );
    return placement === 'floating'
        ? createPortal(toast, document.body)
        : toast;
}
