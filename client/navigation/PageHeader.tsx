import type { Ref } from 'react';
import Brand from '../components/Brand';
import EditIcon from '../components/EditIcon';
import {
    CancelButton,
    ConfirmButton,
} from '../components/ConfirmCancelButtons';
import { pageConfig, type Page } from './pages';

/** Header ✕ / ✓ for an edit that is not a form (e.g. a My Diary meal). */
export type HeaderEditActions = {
    title: string;
    saving: boolean;
    cancelLabel: string;
    saveLabel: string;
    savingLabel: string;
    onCancel: () => void;
    onSave: () => void;
};

type PageHeaderProps = {
    currentPage: Page;
    themed: boolean;
    editor?: {
        formId: string;
        subject: 'ingredient' | 'meal';
        saving: boolean;
    };
    /** Replaces the header with ✕ title ✓ while something is edited. */
    editActions?: HeaderEditActions;
    onBack: () => void;
    onEdit?: () => void;
    onOpenMenu: () => void;
    onSignOut: () => void;
    menuOpen: boolean;
    menuButtonRef: Ref<HTMLButtonElement>;
    showMenu?: boolean;
};

export default function PageHeader({
    currentPage,
    themed,
    editor,
    editActions,
    onBack,
    onEdit,
    onOpenMenu,
    onSignOut,
    menuOpen,
    menuButtonRef,
    showMenu = true,
}: PageHeaderProps) {
    const config = pageConfig[currentPage];
    // Editing a My Diary meal confirms from the header, like an iOS
    // navigation bar in edit mode, leaving the meal itself uncluttered.
    // The header is part of the edit, so tapping it never saves on leave.
    if (editActions) {
        return (
            <header
                className="page-header page-header-create-recipe page-header-name-edit"
                data-part-of-edit=""
            >
                <div className="page-header-inner">
                    <CancelButton
                        key="cancel-header-edit"
                        disabled={editActions.saving}
                        label={editActions.cancelLabel}
                        title="Cancel changes"
                        onClick={editActions.onCancel}
                    />
                    <span className="page-header-create-title">
                        {editActions.title}
                    </span>
                    <ConfirmButton
                        key="save-header-edit"
                        disabled={editActions.saving}
                        busy={editActions.saving}
                        label={
                            editActions.saving
                                ? editActions.savingLabel
                                : editActions.saveLabel
                        }
                        title="Save changes"
                        onClick={editActions.onSave}
                    />
                </div>
            </header>
        );
    }
    // Renaming a recipe or plan meal confirms from the header, like an iOS navigation bar,
    // so the name field keeps the heading's width.
    if (
        (currentPage === 'recipe-detail' ||
            currentPage === 'plan-meal-detail') &&
        editor
    ) {
        return (
            <header className="page-header page-header-create-recipe page-header-name-edit">
                <div className="page-header-inner">
                    <CancelButton
                        key="cancel-name-edit"
                        type="reset"
                        form={editor.formId}
                        disabled={editor.saving}
                        label="Cancel name changes"
                        title="Cancel changes"
                    />
                    <span className="page-header-create-title">Edit Name</span>
                    <ConfirmButton
                        key="save-name-edit"
                        type="submit"
                        form={editor.formId}
                        disabled={editor.saving}
                        busy={editor.saving}
                        label={
                            editor.saving
                                ? 'Saving name changes'
                                : 'Save name changes'
                        }
                        title="Save changes"
                    />
                </div>
            </header>
        );
    }
    const createForm =
        currentPage === 'create-recipe'
            ? {
                  formId: 'create-recipe-form',
                  cancelLabel: 'Cancel creating recipe',
                  saveLabel: 'Save recipe',
              }
            : undefined;
    if (createForm) {
        return (
            <header className="page-header page-header-create-recipe">
                <div className="page-header-inner">
                    <CancelButton
                        onClick={onBack}
                        label={createForm.cancelLabel}
                    />
                    <span className="page-header-create-title">
                        {config.title}
                    </span>
                    <ConfirmButton
                        type="submit"
                        form={createForm.formId}
                        label={createForm.saveLabel}
                    />
                </div>
            </header>
        );
    }
    return (
        <header
            className={`page-header ${themed ? 'page-header-meal-maker' : ''}`}
        >
            <div className="page-header-inner">
                {editor ? (
                    <CancelButton
                        type="reset"
                        form={editor.formId}
                        className="page-header-cancel"
                        disabled={editor.saving}
                        label="Cancel editing"
                    />
                ) : (
                    config.type !== 'main' && (
                        <button
                            key="back"
                            type="button"
                            className="page-header-back"
                            onClick={onBack}
                            aria-label="Back"
                        >
                            ‹
                        </button>
                    )
                )}

                <Brand className="page-header-brand" />

                {editor ? (
                    <ConfirmButton
                        key="save-detail"
                        type="submit"
                        form={editor.formId}
                        className="page-header-confirm"
                        disabled={editor.saving}
                        busy={editor.saving}
                        label={
                            editor.saving
                                ? 'Saving changes'
                                : `Save ${editor.subject}`
                        }
                        title={`Save ${editor.subject}`}
                    />
                ) : onEdit ? (
                    <button
                        key="edit-detail"
                        type="button"
                        className="edit-icon-button page-header-save"
                        aria-label={`Edit ${currentPage === 'ingredient-detail' ? 'ingredient' : 'meal'}`}
                        title={`Edit ${currentPage === 'ingredient-detail' ? 'ingredient' : 'meal'}`}
                        onClick={(event) => {
                            event.preventDefault();
                            onEdit();
                        }}
                    >
                        <EditIcon />
                    </button>
                ) : config.type === 'main' && showMenu ? (
                    <button
                        ref={menuButtonRef}
                        type="button"
                        className="page-header-menu"
                        onClick={onOpenMenu}
                        aria-label="Open navigation menu"
                        aria-expanded={menuOpen}
                        aria-controls="sidebar"
                    >
                        <span className="menu-icon" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                    </button>
                ) : config.type !== 'main' &&
                  currentPage !== 'recipe-detail' &&
                  currentPage !== 'plan-meal-detail' ? (
                    <div className="page-header-actions">
                        <button
                            type="button"
                            className="page-header-signout"
                            onClick={onSignOut}
                        >
                            Log out
                        </button>
                    </div>
                ) : null}
            </div>
        </header>
    );
}
