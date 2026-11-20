import type { ReactNode, Ref } from 'react';
import SlidingSheet from '../../components/SlidingSheet';
import {
    CancelButton,
    ConfirmButton,
} from '../../components/ConfirmCancelButtons';
import './IngredientNutritionSheet.css';

export default function NutritionSheetDialog({
    children,
    onClose,
    label,
    editor,
    onBack,
    fullHeight,
    saveButtonRef,
    headerAction,
}: {
    children: ReactNode;
    onClose: () => void;
    label: string;
    /** Editing: ✕ and ✓ in the header. */
    editor?: {
        formId: string;
        saving: boolean;
        saveLabel?: string;
    };
    /** Shows a leading ✕ that returns to the nutrition view. */
    onBack?: () => void;
    /** Opens to full height, e.g. while searching, so it never grows. */
    fullHeight?: boolean;
    saveButtonRef?: Ref<HTMLButtonElement>;
    /** A trailing action in the top bar when not editing, e.g. a ☆. */
    headerAction?: ReactNode;
}) {
    return (
        <SlidingSheet
            label={label}
            className={`ingredient-nutrition-sheet${fullHeight ? ' ingredient-nutrition-sheet-full' : ''}`}
            onClose={onClose}
            dismissible={!editor?.saving}
            header={
                editor ? (
                    <>
                        <CancelButton
                            key="cancel-edit"
                            type="reset"
                            form={editor.formId}
                            className="ingredient-sheet-cancel"
                            disabled={editor.saving}
                            label="Cancel editing"
                        />
                        <ConfirmButton
                            key="save-edit"
                            ref={saveButtonRef}
                            type="submit"
                            form={editor.formId}
                            className="ingredient-sheet-save"
                            disabled={editor.saving}
                            busy={editor.saving}
                            label={
                                editor.saving
                                    ? 'Saving changes'
                                    : (editor.saveLabel ??
                                      'Save ingredient changes')
                            }
                            title={
                                editor.saveLabel ?? 'Save ingredient changes'
                            }
                        />
                    </>
                ) : onBack ? (
                    <CancelButton
                        key="back"
                        className="ingredient-sheet-cancel"
                        label="Back to nutrition"
                        onClick={onBack}
                    />
                ) : (
                    headerAction
                )
            }
        >
            {children}
        </SlidingSheet>
    );
}
