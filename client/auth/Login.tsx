import { useState } from 'react';
import { useAuth } from './useAuth';
import './Login.css';
import LoadingSpinner from '../components/LoadingSpinner';
import Brand from '../components/Brand';

export default function Login() {
    const { signIn, signUp, signInWithGoogle } = useAuth();

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
            <div className="login-shell">
                <Brand className="login-brand" />
                <section className="login" aria-labelledby="login-heading">
                    <header className="login-heading">
                        <h1 id="login-heading">
                            {isSignUp ? 'A fresh start.' : 'Welcome back.'}
                        </h1>
                        <p className="login-subtitle">
                            {isSignUp
                                ? 'Create your account and make something delicious with what you have.'
                                : 'Your ingredients, favourite meals and a little inspiration — all in one place.'}
                        </p>
                    </header>

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
                        >
                            <path
                                fill="#4285f4"
                                d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"
                            />
                            <path
                                fill="#34a853"
                                d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
                            />
                            <path
                                fill="#fbbc05"
                                d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"
                            />
                            <path
                                fill="#ea4335"
                                d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
                            />
                        </svg>
                        Continue with Google
                    </button>

                    <div className="login-divider">
                        <span>or continue with email</span>
                    </div>

                    <form
                        className="login-form"
                        onSubmit={handleSubmit}
                        aria-busy={isLoading}
                    >
                        <div className="login-field">
                            <label htmlFor="email">Email address</label>
                            <input
                                id="email"
                                type="email"
                                inputMode="email"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                required
                                autoComplete="email"
                                autoCapitalize="none"
                                spellCheck={false}
                                placeholder="you@example.com"
                                disabled={isLoading}
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
                                required
                                minLength={6}
                                autoComplete={
                                    isSignUp
                                        ? 'new-password'
                                        : 'current-password'
                                }
                                placeholder={
                                    isSignUp
                                        ? 'At least 6 characters'
                                        : 'Enter your password'
                                }
                                disabled={isLoading}
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
                            {isLoading ? (
                                <span className="loading-label">
                                    <LoadingSpinner
                                        size="small"
                                        tone="inherit"
                                    />
                                    Please wait…
                                </span>
                            ) : isSignUp ? (
                                'Create account'
                            ) : (
                                'Sign in'
                            )}
                        </button>
                    </form>

                    <p className="login-switch">
                        {isSignUp
                            ? 'Already have an account?'
                            : 'New to Meal Maker?'}{' '}
                        <button
                            type="button"
                            className="login-toggle"
                            disabled={isLoading}
                            onClick={() => {
                                setIsSignUp((value) => !value);
                                setError(undefined);
                                setMessage(undefined);
                            }}
                        >
                            {isSignUp ? 'Sign in' : 'Create an account'}
                        </button>
                    </p>
                </section>
                <p className="login-tagline">
                    Your ingredients. A delicious meal.
                </p>
            </div>
        </main>
    );
}
