import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { mealPreferencesEnabled } from './features';
import Profile from './Profile';
import { deleteAccount } from './services/accountService';

const auth = vi.hoisted(() => ({
    user: {
        id: 'user',
        email: 'sam@example.com',
    } as Record<string, unknown>,
}));
vi.mock('./auth/useAuth', () => ({ useAuth: () => auth }));
vi.mock('./services/accountService', () => ({
    deleteAccount: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

function renderProfile() {
    const onSignOut = vi.fn();
    const onAccountDeleted = vi.fn();
    render(
        <Profile onSignOut={onSignOut} onAccountDeleted={onAccountDeleted} />,
    );
    return { onSignOut, onAccountDeleted };
}

it('shows the email, Log Out and Delete Account', () => {
    renderProfile();
    expect(screen.getByText('sam@example.com')).toBeVisible();
    expect(
        screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Log Out', 'Delete Account']);
});

it('logs out, and deletes the account only after confirming', async () => {
    const user = userEvent.setup();
    const { onSignOut, onAccountDeleted } = renderProfile();

    await user.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(onSignOut).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Delete Account' }));
    expect(deleteAccount).not.toHaveBeenCalled();
    const confirm = document.querySelector<HTMLButtonElement>(
        '.profile-delete-confirm .collection-delete-confirm-button',
    )!;
    expect(confirm.closest('[popover]')).toHaveTextContent(
        'permanently deleted',
    );
    await user.click(confirm);
    expect(deleteAccount).toHaveBeenCalledOnce();
    await waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce());
});

it('toggles meal preferences from the development-only setting', async () => {
    const user = userEvent.setup();
    renderProfile();
    const toggle = screen.getByRole('switch', {
        name: 'Show meal preferences',
    });
    expect(toggle).toBeChecked();
    expect(mealPreferencesEnabled()).toBe(true);

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(mealPreferencesEnabled()).toBe(false);
});
