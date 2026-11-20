import { useState } from 'react';
import { useAuth } from './auth/useAuth';
import LoadingSpinner from './components/LoadingSpinner';
import Popover from './components/Popover';
import {
    mealPreferencesEnabled,
    setMealPreferencesEnabled,
    showDeveloperSettings,
} from './features';
import { deleteAccount } from './services/accountService';
import { APP_VERSION } from './version';
import './components/CollectionSelection.css';
import './Profile.css';

/**
 * Profile: who is signed in, then Log Out and a quiet Delete Account link
 * (confirmed first) at the bottom of the page. iOS Settings style.
 */
export default function Profile({
    onSignOut,
    onAccountDeleted,
}: {
    onSignOut: () => void;
    onAccountDeleted: () => void;
}) {
    const { user } = useAuth();
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [showMealPreferences, setShowMealPreferences] = useState(
        mealPreferencesEnabled,
    );
    const email = user?.email ?? '';

    async function removeAccount() {
        setDeleting(true);
        setError('');
        try {
            await deleteAccount();
            onAccountDeleted();
        } catch {
            setDeleting(false);
            setError('Could not delete your account. Please try again.');
        }
    }

    return (
        <section
            className="profile saved-collection"
            aria-labelledby="profile-heading"
        >
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <h1 id="profile-heading">Profile</h1>
                </div>
            </header>

            <div className="profile-account">
                <span className="profile-avatar" aria-hidden="true">
                    {email.charAt(0).toUpperCase() || '?'}
                </span>
                <p className="profile-email">{email}</p>
            </div>

            {showDeveloperSettings && (
                <section
                    className="profile-developer"
                    aria-labelledby="profile-developer-title"
                >
                    <h2 id="profile-developer-title">Development only</h2>
                    <label className="profile-switch-row">
                        <span>Show meal preferences</span>
                        <input
                            type="checkbox"
                            role="switch"
                            className="profile-switch"
                            checked={showMealPreferences}
                            onChange={(event) => {
                                setMealPreferencesEnabled(event.target.checked);
                                setShowMealPreferences(event.target.checked);
                            }}
                        />
                    </label>
                </section>
            )}

            {error && (
                <p className="profile-error" role="alert">
                    {error}
                </p>
            )}

            {/* Log Out and, quieter below it, Delete Account sit at the
                bottom of the page, as in most apps' settings. */}
            <div className="profile-actions">
                <button
                    type="button"
                    className="profile-log-out"
                    onClick={onSignOut}
                >
                    Log Out
                </button>
                <Popover
                    trigger={
                        deleting ? (
                            <LoadingSpinner size="small" tone="inherit" />
                        ) : (
                            'Delete Account'
                        )
                    }
                    triggerClassName="profile-delete-link"
                    triggerDisabled={deleting}
                    label="Delete your account?"
                    panelClassName="collection-delete-confirm profile-delete-confirm"
                    width={280}
                >
                    {(close) => (
                        <>
                            <p>
                                Your recipes, ingredients and diary will be
                                permanently deleted.
                            </p>
                            <button
                                type="button"
                                className="collection-delete-confirm-button"
                                onClick={() => {
                                    close();
                                    void removeAccount();
                                }}
                            >
                                Delete Account
                            </button>
                        </>
                    )}
                </Popover>
                <p className="profile-version">Version {APP_VERSION}</p>
            </div>
        </section>
    );
}
