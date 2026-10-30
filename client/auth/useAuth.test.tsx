import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

const auth = vi.hoisted(() => ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    unsubscribe: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth } }));

function SessionView() {
    const { user, loading } = useAuth();
    return <p>{loading ? 'Loading session' : (user?.email ?? 'Signed out')}</p>;
}
it('shares the provider context with its separate hook and cleans up the subscription', async () => {
    const session = {
        user: { id: 'user', email: 'cook@example.com' },
    } as Session;
    auth.getSession.mockResolvedValue({ data: { session } });
    let changeSession!: (event: string, session: Session | null) => void;
    auth.onAuthStateChange.mockImplementation((callback) => {
        changeSession = callback;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    });
    const { unmount } = render(
        <AuthProvider>
            <SessionView />
        </AuthProvider>,
    );
    expect(screen.getByText('Loading session')).toBeInTheDocument();
    expect(await screen.findByText('cook@example.com')).toBeInTheDocument();
    act(() => changeSession('SIGNED_OUT', null));
    expect(screen.getByText('Signed out')).toBeInTheDocument();
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalledOnce();
});
