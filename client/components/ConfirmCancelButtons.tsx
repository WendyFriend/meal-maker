import type { ComponentPropsWithRef } from 'react';
import CheckIcon from './CheckIcon';
import CloseIcon from './CloseIcon';
import LoadingSpinner from './LoadingSpinner';
import './ConfirmCancelButtons.css';

type IconActionProps = Omit<
    ComponentPropsWithRef<'button'>,
    'children' | 'aria-label'
> & {
    /** Accessible name, also used as the tooltip unless `title` is given. */
    label: string;
};

/**
 * Apple-style cancel: a quiet ✕ on the leading side of a cancel/confirm pair.
 * Use it wherever an action discards changes or exits a mode.
 */
export function CancelButton({
    label,
    title,
    className = '',
    type = 'button',
    ...props
}: IconActionProps) {
    return (
        <button
            {...props}
            type={type}
            className={`action-icon-button action-icon-button-cancel ${className}`.trim()}
            aria-label={label}
            title={title ?? label}
        >
            <CloseIcon />
        </button>
    );
}

/**
 * Apple-style confirm: the single prominent ✓ on the trailing side. Shows a
 * spinner in place while `busy`; use `tone="danger"` for destructive confirms.
 */
export function ConfirmButton({
    label,
    title,
    busy = false,
    tone = 'accent',
    className = '',
    type = 'button',
    ...props
}: IconActionProps & { busy?: boolean; tone?: 'accent' | 'danger' }) {
    return (
        <button
            {...props}
            type={type}
            className={`action-icon-button action-icon-button-confirm${tone === 'danger' ? ' action-icon-button-danger' : ''} ${className}`.trim()}
            aria-label={label}
            aria-busy={busy || undefined}
            title={title ?? label}
        >
            {busy ? (
                <LoadingSpinner size="small" tone="inherit" />
            ) : (
                <CheckIcon />
            )}
        </button>
    );
}
