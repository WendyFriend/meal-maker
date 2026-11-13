import type { ReactNode } from 'react';
import ActionToast from './ActionToast';
import CheckIcon from './CheckIcon';
import CloseIcon from './CloseIcon';
import EditIcon from './EditIcon';
import LoadingSpinner from './LoadingSpinner';
import type { IngredientSectionFeedback } from '../hooks/useIngredientSectionSave';
import './IngredientSection.css';

const defaultToastColors = {
    background: '#fff',
    text: 'var(--text-h-strong)',
    iconBackground: '#e6f3e5',
    icon: '#27813a',
};

export function IngredientSectionActions({
    editing,
    saving = false,
    disabled = false,
    editLabel = 'Edit ingredients',
    onEdit,
    onCancel,
    onSave,
}: {
    editing: boolean;
    saving?: boolean;
    disabled?: boolean;
    editLabel?: string;
    onEdit?: () => void;
    onCancel?: () => void;
    onSave?: () => void;
}) {
    if (!editing)
        return onEdit ? (
            <button
                type="button"
                className="edit-icon-button ingredient-section-edit-button"
                aria-label={editLabel}
                title="Edit ingredients"
                disabled={disabled}
                onClick={onEdit}
            >
                <EditIcon />
            </button>
        ) : null;

    return (
        <div className="ingredient-section-edit-actions">
            <button
                type="button"
                aria-label="Cancel ingredients changes"
                title="Cancel changes"
                disabled={saving}
                onClick={onCancel}
            >
                <CloseIcon />
            </button>
            <button
                type="button"
                className="ingredient-section-save"
                aria-label={
                    saving
                        ? 'Saving ingredients changes'
                        : 'Save ingredients changes'
                }
                title={saving ? 'Saving changes' : 'Save changes'}
                disabled={saving}
                onClick={onSave}
            >
                {saving ? (
                    <LoadingSpinner size="small" tone="inherit" />
                ) : (
                    <CheckIcon />
                )}
            </button>
        </div>
    );
}

export default function IngredientSection({
    children,
    className = '',
    headerClassName = '',
    actions,
    editing = false,
    footer,
    error,
    feedback,
    toastColors = defaultToastColors,
}: {
    children: ReactNode;
    className?: string;
    headerClassName?: string;
    actions?: ReactNode;
    editing?: boolean;
    footer?: ReactNode;
    error?: string;
    feedback?: IngredientSectionFeedback;
    toastColors?: {
        background?: string;
        text?: string;
        iconBackground?: string;
        icon?: string;
    };
}) {
    return (
        <section
            className={className}
            aria-label="Ingredients"
            aria-busy={feedback?.saving}
        >
            <div className={headerClassName}>
                {!editing && <h3>Ingredients</h3>}
                {actions}
            </div>
            {error && (
                <p className="ingredient-section-error" role="alert">
                    {error}
                </p>
            )}
            {children}
            {footer}
            {feedback?.saving && (
                <ActionToast
                    message="Saving ingredients…"
                    icon={<LoadingSpinner size="small" tone="inherit" />}
                    placement="floating"
                    colors={toastColors}
                />
            )}
            {!feedback?.saving && feedback?.successId != null && (
                <ActionToast
                    key={feedback.successId}
                    message="Ingredients updated"
                    placement="floating"
                    colors={toastColors}
                    onClose={() => feedback.dismiss(feedback.successId!)}
                />
            )}
        </section>
    );
}
