import { useState } from 'react';
import { useAuth } from './AuthContext';
import { isDevAuthAvailable } from './devAuth';
import type { PlanTier } from '../../shared/plans';
import './Login.css';

const DEV_TIERS: { tier: PlanTier; label: string }[] = [
    { tier: 'free', label: 'Free' },
    { tier: 'trial', label: 'Trial' },
    { tier: 'pro', label: 'Pro' },
];

export default function Login() {
    const { signIn, signUp, signInWithGoogle, signInAsDev } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState<string>();
    const [message, setMessage] = useState<string>();
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError(undefined);
        setMessage(undefined);
        setIsLoading(true);

        try {
            if (isSignUp) {
                await signUp(email, password);
                setMessage(
                    'Account created. Please check your email to verify your account.',
                );
            } else {
                await signIn(email, password);
            }
        } catch (error) {
            console.error(error);

            setError(
                error instanceof Error
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );
        } finally {
            setIsLoading(false);
        }
    }

    async function handleGoogleLogin() {
        setError(undefined);
        setMessage(undefined);
        setIsLoading(true);

        try {
            await signInWithGoogle();
        } catch (error) {
            console.error(error);

            setError(
                error instanceof Error
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );

            setIsLoading(false);
        }
    }

    return (
        <main className="login-page">
            <section className="login">
                <h1>
                    <span className="brand-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                            <path d="M4 10.5C4 6.9 7.1 4 11 4c1.1 0 2.1.25 3 .7V19c0 .6-.4 1-1 1h-4c-.6 0-1-.4-1-1v-8.3" />
                            <path d="M13.2 12.5c1.7-1.9 4-3.9 6.3-3.4" />
                        </svg>
                    </span>
                    Meal Maker
                </h1>

                <h2>{isSignUp ? 'Create an account' : 'Welcome back'}</h2>

                <p className="login-subtitle">
                    {isSignUp
                        ? 'Create an account to save your ingredients and meals.'
                        : 'Sign in to access your saved ingredients and meals.'}
                </p>

                <button
                    type="button"
                    className="google-button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                >
                    <svg
                        className="google-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            fill="#4285F4"
                            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5h-4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1c.9-2.8 3.5-4.8 6.6-4.8z"
                        />
                    </svg>
                    Continue with Google
                </button>

                <div className="login-divider">
                    <span>or</span>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="login-field">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="login-field">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            placeholder={
                                isSignUp
                                    ? 'At least 6 characters'
                                    : 'Your password'
                            }
                            required
                            minLength={6}
                            autoComplete={
                                isSignUp ? 'new-password' : 'current-password'
                            }
                        />
                    </div>

                    {error && (
                        <div className="login-error" role="alert">
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="login-message" role="status">
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading
                            ? 'Please wait...'
                            : isSignUp
                              ? 'Create account'
                              : 'Sign in'}
                    </button>
                </form>

                <button
                    type="button"
                    className="login-toggle"
                    onClick={() => {
                        setIsSignUp((value) => !value);
                        setError(undefined);
                        setMessage(undefined);
                    }}
                >
                    {isSignUp ? (
                        <>
                            Already have an account? <strong>Sign in</strong>
                        </>
                    ) : (
                        <>
                            New here? <strong>Create an account</strong>
                        </>
                    )}
                </button>

                {isDevAuthAvailable && (
                    <div className="dev-login" aria-label="Dev login">
                        <span className="dev-login-label">
                            Dev login · skips Supabase
                        </span>
                        <div className="dev-login-options">
                            {DEV_TIERS.map(({ tier, label }) => (
                                <button
                                    key={tier}
                                    type="button"
                                    className="dev-login-button"
                                    onClick={() => signInAsDev(tier)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>
        </main>
    );
}
