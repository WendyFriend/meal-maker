import type { ComponentPropsWithoutRef } from 'react';
import './AddRowButton.css';

/** Full-width "+ Add …" button at the end of an editable list. */
export default function AddRowButton({
    label,
    className = '',
    ...props
}: Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    /** Visible text after the plus, e.g. "Add ingredient". */
    label: string;
}) {
    return (
        <button
            type="button"
            className={`add-row-button ${className}`.trim()}
            aria-label={label}
            {...props}
        >
            <span aria-hidden="true">+</span> {label}
        </button>
    );
}
