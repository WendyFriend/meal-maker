import { useState } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import Login from './Login';
import mealMakerLogo from '../assets/icons/meal-maker-logo.svg';
import type { AccountRequiredAction } from './useGuestAccess';
import './AccountRequiredDialog.css';

/** Outcomes, not features: short, verb first, one line each. */
const benefits = [
    {
        text: 'Save your own ingredients',
        icon: (
            <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.6-5 2.6.9-5.6-4-3.9 5.6-.8Z" />
        ),
    },
    {
        text: 'Save your custom recipes',
        icon: (
            <>
                <path d="M6 3.5h9.5a2.5 2.5 0 0 1 2.5 2.5v14.5H8.5A2.5 2.5 0 0 1 6 18Z" />
                <path d="M9.5 8.5h5M9.5 12h5" />
            </>
        ),
    },
    {
        text: 'Easy meal planning & food lists',
        icon: (
            <>
                <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
                <path d="M8 3.5v4M16 3.5v4M9 14l2 2 4-4" />
            </>
        ),
    },
    {
        text: 'Macro & micronutrient tracking',
        icon: <path d="M5.5 19.5v-6M12 19.5v-14M18.5 19.5v-9" />,
    },
];

export default function AccountRequiredDialog({
    action,
    onClose,
}: {
    action: AccountRequiredAction;
    onClose: () => void;
}) {
    const dialogRef = useModalDialog();
    // Anything a guest tried to keep starts at Create account; returning
    // users are one tap away ("Already have an account? Sign in").
    const initialMode = action === 'sign-in' ? 'sign-in' : 'sign-up';
    const [mode, setMode] = useState<'sign-in' | 'sign-up'>(initialMode);
    // The app's name never breaks across lines.
    const title =
        mode === 'sign-up' ? (
            <>
                Create your <span className="nowrap">Meal Maker</span> account
            </>
        ) : (
            'Welcome back'
        );

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
                    <span className="account-required-logo" aria-hidden="true">
                        <img src={mealMakerLogo} alt="" />
                    </span>
                    <h2 id="account-required-title">{title}</h2>
                </header>
                {mode === 'sign-up' && (
                    <ul className="account-required-benefits">
                        {benefits.map(({ text, icon }) => (
                            <li key={text}>
                                <span className="account-required-benefit-icon">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        {icon}
                                    </svg>
                                </span>
                                {text}
                            </li>
                        ))}
                    </ul>
                )}
                <Login
                    embedded
                    initialMode={initialMode}
                    onModeChange={setMode}
                />
            </div>
        </dialog>
    );
}
