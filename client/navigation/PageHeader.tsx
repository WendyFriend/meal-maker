import type { Ref } from 'react';
import Brand from '../components/Brand';
import EditIcon from '../components/EditIcon';
import CheckIcon from '../components/CheckIcon';
import CloseIcon from '../components/CloseIcon';
import LoadingSpinner from '../components/LoadingSpinner';
import { pageConfig, type Page } from './pages';

type PageHeaderProps = {
    currentPage: Page;
    themed: boolean;
    editor?: {
        formId: string;
        subject: 'ingredient' | 'meal';
        saving: boolean;
    };
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
    onBack,
    onEdit,
    onOpenMenu,
    onSignOut,
    menuOpen,
    menuButtonRef,
    showMenu = true,
}: PageHeaderProps) {
    const config = pageConfig[currentPage];
    if (currentPage === 'recipe-detail' && editor) {
        return (
            <header className="page-header page-header-create-recipe">
                <div className="page-header-inner">
                    <button
                        key="cancel-recipe-edit"
                        type="reset"
                        form={editor.formId}
                        className="page-header-create-cancel"
                        disabled={editor.saving}
                        aria-label="Cancel editing"
                        title="Cancel editing"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 5 19 19M19 5 5 19" />
                        </svg>
                    </button>
                    <span className="page-header-create-title">
                        Edit Recipe
                    </span>
                    <button
                        key="save-recipe-edit"
                        type="submit"
                        form={editor.formId}
                        className="page-header-create-save"
                        disabled={editor.saving}
                        aria-label={editor.saving ? 'Saving meal' : 'Save meal'}
                        title={editor.saving ? 'Saving meal' : 'Save meal'}
                    >
                        {editor.saving ? (
                            <LoadingSpinner size="small" tone="inherit" />
                        ) : (
                            <CheckIcon />
                        )}
                    </button>
                </div>
            </header>
        );
    }
    if (currentPage === 'create-recipe') {
        return (
            <header className="page-header page-header-create-recipe">
                <div className="page-header-inner">
                    <button
                        type="button"
                        className="page-header-create-cancel"
                        onClick={onBack}
                        aria-label="Cancel creating recipe"
                        title="Cancel creating recipe"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 5 19 19M19 5 5 19" />
                        </svg>
                    </button>
                    <span className="page-header-create-title">
                        Create Recipe
                    </span>
                    <button
                        type="submit"
                        form="create-recipe-form"
                        className="page-header-create-save"
                        aria-label="Save recipe"
                        title="Save recipe"
                    >
                        <CheckIcon />
                    </button>
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
                    <button
                        type="reset"
                        form={editor.formId}
                        className="page-header-back page-header-edit-action"
                        disabled={editor.saving}
                        aria-label="Cancel editing"
                        title="Cancel editing"
                    >
                        <CloseIcon />
                    </button>
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
                    <button
                        key="save-detail"
                        type="submit"
                        form={editor.formId}
                        className="page-header-back page-header-edit-action page-header-save"
                        disabled={editor.saving}
                        aria-label={
                            editor.saving
                                ? 'Saving changes'
                                : `Save ${editor.subject}`
                        }
                        title={`Save ${editor.subject}`}
                    >
                        <CheckIcon />
                    </button>
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
                  currentPage !== 'recipe-detail' ? (
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
