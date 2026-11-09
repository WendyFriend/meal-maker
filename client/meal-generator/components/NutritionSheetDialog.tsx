import type { ReactNode, Ref } from 'react';
import SlidingSheet from '../../components/SlidingSheet';
import './IngredientNutritionSheet.css';

export default function NutritionSheetDialog({
    children,
    onClose,
    labelledBy,
    label,
    editor,
    readAction,
    saveButtonRef,
}: {
    children: ReactNode;
    onClose: () => void;
    labelledBy?: string;
    label?: string;
    editor?: { formId: string; saving: boolean };
    readAction?: ReactNode;
    saveButtonRef?: Ref<HTMLButtonElement>;
}) {
    return (
        <SlidingSheet
            label={label}
            labelledBy={labelledBy}
            className="ingredient-nutrition-sheet"
            onClose={onClose}
            dismissible={!editor?.saving}
            header={
                editor ? (
                    <>
                        <button
                            key="cancel-edit"
                            type="reset"
                            form={editor.formId}
                            className="ingredient-nutrition-close ingredient-sheet-cancel"
                            disabled={editor.saving}
                            aria-label="Cancel editing"
                            title="Cancel editing"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m6 6 12 12M18 6 6 18" />
                            </svg>
                        </button>
                        <button
                            key="save-edit"
                            ref={saveButtonRef}
                            type="submit"
                            form={editor.formId}
                            className="ingredient-nutrition-close ingredient-sheet-save"
                            disabled={editor.saving}
                            aria-label={
                                editor.saving
                                    ? 'Saving changes'
                                    : 'Save ingredient changes'
                            }
                            title="Save ingredient changes"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m5 12 4 4L19 6" />
                            </svg>
                        </button>
                    </>
                ) : (
                    readAction
                )
            }
        >
            {children}
        </SlidingSheet>
    );
}
