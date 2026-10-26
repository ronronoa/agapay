import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUserDto } from '@agapay/shared';
import { toast } from 'sonner';
import { AccountSettingsPage } from './AccountSettingsPage';
import { apiFetch } from '../lib/api-client';
import { getUser, setSession } from '../lib/session';

vi.mock('../lib/api-client', () => ({ apiFetch: vi.fn(), ApiClientError: class extends Error {} }));

const user: AuthUserDto = {
  id: 'account-id',
  name: 'Agapay Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  phone: '09171234567',
  emailVerified: true,
  isActive: true,
  createdAt: '2026-10-26T00:00:00.000Z',
};
beforeEach(() => {
  vi.clearAllMocks();
});

function show(role: AuthUserDto['role'] = 'ADMIN') {
  setSession('access-token', { ...user, role });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['private-account-data'], { private: true });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<AccountSettingsPage />} />
          <Route path="/login" element={<p>Sign in again</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function fillPasswords(confirm = 'my new strong password') {
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'my current password' },
  });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'my new strong password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
}

describe('Account settings', () => {
  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    'saves the own profile for %s and clears optional phone without sending null',
    async (role) => {
      show(role);
      vi.mocked(apiFetch).mockResolvedValue({
        data: { ...user, role, name: 'Updated Admin', phone: null },
      });
      fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Updated Admin' } });
      fireEvent.change(screen.getByLabelText('Contact Number'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
      await waitFor(() => expect(getUser()?.name).toBe('Updated Admin'));
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/auth/me', {
        method: 'PATCH',
        body: { name: 'Updated Admin', phone: undefined },
      });
      expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
    },
  );

  it('requires matching password confirmation and lets users reveal passwords', async () => {
    show();
    fillPasswords('different password');
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show passwords' }));
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide passwords' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
  });

  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    'changes the password for %s then clears session/cache and returns to login',
    async (role) => {
      const client = show(role);
      vi.mocked(apiFetch).mockResolvedValue(undefined);
      fillPasswords();
      fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
      expect(await screen.findByText('Sign in again')).toBeInTheDocument();
      expect(getUser()).toBeNull();
      expect(client.getQueryData(['private-account-data'])).toBeUndefined();
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        body: { currentPassword: 'my current password', newPassword: 'my new strong password' },
      });
    },
  );

  it('disables both forms during saving and preserves values after failure', async () => {
    show();
    let fail: ((error: Error) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const errorToast = vi.spyOn(toast, 'error');
    fillPasswords();
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(screen.getByLabelText('Current password')).toBeDisabled();
    fail?.(new Error('network failure'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change Password' })).toBeEnabled(),
    );
    expect(screen.getByLabelText('New password')).toHaveValue('my new strong password');
    expect(getUser()?.role).toBe('ADMIN');
    expect(errorToast).toHaveBeenCalledWith('Could not change your password.');
  });
});
