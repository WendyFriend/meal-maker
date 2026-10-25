import type { Session, User } from '@supabase/supabase-js';

// Dev-only login that skips Supabase entirely. `import.meta.env.DEV` is
// false in production builds, so none of this can be enabled there.
export const isDevAuthAvailable = import.meta.env.DEV;

const DEV_SESSION_KEY = 'mealmaker-dev-session';

const devUser: User = {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'dev@localhost',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'dev' },
    user_metadata: { name: 'Dev User' },
    created_at: new Date(0).toISOString(),
};

const devSession: Session = {
    access_token: 'dev-access-token',
    refresh_token: 'dev-refresh-token',
    token_type: 'bearer',
    expires_in: Number.MAX_SAFE_INTEGER,
    user: devUser,
};

export function isDevSessionActive(): boolean {
    return (
        isDevAuthAvailable && localStorage.getItem(DEV_SESSION_KEY) === 'true'
    );
}

export function getDevSession(): Session | null {
    return isDevSessionActive() ? devSession : null;
}

export function startDevSession(): Session {
    if (!isDevAuthAvailable) {
        throw new Error('Dev login is only available in development');
    }

    localStorage.setItem(DEV_SESSION_KEY, 'true');
    return devSession;
}

export function endDevSession() {
    localStorage.removeItem(DEV_SESSION_KEY);
}
