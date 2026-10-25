import type { Session, User } from '@supabase/supabase-js';
import type { PlanTier } from '../../shared/plans';

// Dev-only login that skips Supabase entirely. `import.meta.env.DEV` is
// false in production builds, so none of this can be enabled there.
export const isDevAuthAvailable = import.meta.env.DEV;

// Holds the plan tier of the dev session ('free' | 'trial' | 'pro').
const DEV_SESSION_KEY = 'mealmaker-dev-session';

const DEV_TIERS: PlanTier[] = ['free', 'trial', 'pro'];

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

/* Tier of the active dev session, or null when not in one. Sessions from
   before tiers existed ('true') count as Pro. */
export function getDevTier(): PlanTier | null {
    if (!isDevAuthAvailable) return null;

    const stored = localStorage.getItem(DEV_SESSION_KEY);

    if (stored === 'true') return 'pro';

    return DEV_TIERS.includes(stored as PlanTier) ? (stored as PlanTier) : null;
}

export function isDevSessionActive(): boolean {
    return getDevTier() !== null;
}

export function getDevSession(): Session | null {
    return isDevSessionActive() ? devSession : null;
}

export function startDevSession(tier: PlanTier = 'pro'): Session {
    if (!isDevAuthAvailable) {
        throw new Error('Dev login is only available in development');
    }

    localStorage.setItem(DEV_SESSION_KEY, tier);
    return devSession;
}

/* Switch tiers without signing out (dev plan switcher). */
export function setDevTier(tier: PlanTier) {
    if (isDevSessionActive()) {
        localStorage.setItem(DEV_SESSION_KEY, tier);
    }
}

export function endDevSession() {
    localStorage.removeItem(DEV_SESSION_KEY);
}
