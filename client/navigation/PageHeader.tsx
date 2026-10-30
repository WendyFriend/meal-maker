import type { Ref } from 'react';
import Brand from '../components/Brand';
import EditIcon from '../components/EditIcon';
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
}: PageHeaderProps) {
    const config = pageConfig[currentPage];
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
                        ✕
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
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m5 12 4 4L19 6" />
                        </svg>
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
                ) : config.type === 'main' ? (
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
                ) : (
                    <div className="page-header-actions">
                        <button
                            type="button"
                            className="page-header-signout"
                            onClick={onSignOut}
                        >
                            Log out
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
