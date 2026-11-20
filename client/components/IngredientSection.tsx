import type { ReactNode } from 'react';
import ActionToast from './ActionToast';
import { successToastColors } from './actionToastColors';
import { CancelButton, ConfirmButton } from './ConfirmCancelButtons';
import EditIcon from './EditIcon';
import LoadingSpinner from './LoadingSpinner';
import type { IngredientSectionFeedback } from '../hooks/useIngredientSectionSave';
import './IngredientSection.css';

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
            <CancelButton
                label="Cancel ingredients changes"
                title="Cancel changes"
                disabled={saving}
                onClick={onCancel}
            />
            <ConfirmButton
                className="ingredient-section-save"
                label={
                    saving
                        ? 'Saving ingredients changes'
                        : 'Save ingredients changes'
                }
                title={saving ? 'Saving changes' : 'Save changes'}
                busy={saving}
                disabled={saving}
                onClick={onSave}
            />
        </div>
    );
}

export default function IngredientSection({
    children,
    className = '',
    headerClassName = '',
    showHeading = true,
    actions,
    editing = false,
    footer,
    error,
    feedback,
    messages = {
        saving: 'Saving ingredients…',
        saved: 'Ingredients updated.',
    },
    toastColors = successToastColors,
}: {
    children: ReactNode;
    className?: string;
    headerClassName?: string;
    showHeading?: boolean;
    actions?: ReactNode;
    editing?: boolean;
    footer?: ReactNode;
    error?: string;
    feedback?: IngredientSectionFeedback;
    /** Toast wording while saving and once saved. */
    messages?: { saving: string; saved: string };
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
            {(actions || (showHeading && !editing)) && (
                <div className={headerClassName}>
                    {showHeading && !editing && <h3>Ingredients</h3>}
                    {actions}
                </div>
            )}
            {error && (
                <p className="ingredient-section-error" role="alert">
                    {error}
                </p>
            )}
            {children}
            {footer}
            {feedback?.saving && (
                <ActionToast
                    message={messages.saving}
                    icon={<LoadingSpinner size="small" tone="inherit" />}
                    placement="floating"
                    colors={toastColors}
                />
            )}
            {!feedback?.saving && feedback?.successId != null && (
                <ActionToast
                    key={feedback.successId}
                    message={messages.saved}
                    placement="floating"
                    colors={toastColors}
                    onClose={() => feedback.dismiss(feedback.successId!)}
                />
            )}
        </section>
    );
}
