import LoadingSpinner from '../components/LoadingSpinner';
import Brand from '../components/Brand';
import './Login.css';
import './AuthLoading.css';

export default function AuthLoading() {
    return (
        <main className="login-page">
            <div className="login-shell auth-loading">
                <Brand className="login-brand" />
                <div
                    className="auth-loading-status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    <LoadingSpinner />
                    <p>Getting things ready…</p>
                </div>
            </div>
        </main>
    );
}
