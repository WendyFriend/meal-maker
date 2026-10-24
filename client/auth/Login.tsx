import { useState } from 'react';
import { useAuth } from './AuthContext';
import './Login.css';

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
                    {/* {isSignUp
                        ? 'Create an account to save your ingredients and meals.'
                        : 'Sign in to access your saved ingredients and meals.'} */}
                </p>

                <button
                    type="button"
                    className="google-button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                >
                    <span className="google-icon">G</span>
                    Continue with Google
                </button>

                <div className="login-divider">
                    <span>or</span>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                    />

                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={6}
                        autoComplete={
                            isSignUp ? 'new-password' : 'current-password'
                        }
                    />

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
                    {isSignUp
                        ? 'Already have an account? Sign in'
                        : "Don't have an account? Create one"}
                </button>
            </section>
        </main>
    );
}
