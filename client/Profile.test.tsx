import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
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

beforeEach(() => vi.clearAllMocks());

function renderProfile() {
    const onSignOut = vi.fn();
    const onAccountDeleted = vi.fn();
    render(
        <Profile onSignOut={onSignOut} onAccountDeleted={onAccountDeleted} />,
    );
    return { onSignOut, onAccountDeleted };
}

it('shows only the email, Log Out and Delete Account', () => {
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
