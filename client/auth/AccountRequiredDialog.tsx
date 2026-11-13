import { useModalDialog } from '../hooks/useModalDialog';
import Login from './Login';
import type { AccountRequiredAction } from './useGuestAccess';
import './AccountRequiredDialog.css';

const actionCopy: Record<AccountRequiredAction, string> = {
    'sign-in': 'Sign in to continue to your Meal Maker account.',
    'sign-up': 'Create an account to save meals, ingredients and your food journal.',
    'save-meal': 'Create an account or sign in to save this meal.',
    'my-day': 'Create an account or sign in to add this meal to My Plan.',
    'save-ingredient': 'Create an account or sign in to save this ingredient.',
};

export default function AccountRequiredDialog({
    action,
    onClose,
}: {
    action: AccountRequiredAction;
    onClose: () => void;
}) {
    const dialogRef = useModalDialog();
    const isDirectAuth = action === 'sign-in' || action === 'sign-up';

    return (
        <dialog
            ref={dialogRef}
            className="account-required-dialog"
            aria-labelledby="account-required-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="account-required-content">
                <button
                    type="button"
                    className="account-required-close"
                    aria-label="Close"
                    onClick={onClose}
                >
                    ×
                </button>
                <header className="account-required-heading">
                    <h2 id="account-required-title">
                        {isDirectAuth
                            ? 'Welcome to Meal Maker'
                            : 'Keep your meal'}
                    </h2>
                    <p>
                        {actionCopy[action]}
                        {!isDirectAuth &&
                            ' Your meal will still be here when you return.'}
                    </p>
                </header>
                <Login
                    embedded
                    initialMode={action === 'sign-up' ? 'sign-up' : 'sign-in'}
                />
            </div>
        </dialog>
    );
}
