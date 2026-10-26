import { toast } from 'sonner';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, Ref } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage';
import { SettingsPage } from './SettingsPage';
import { AuditLogPage } from './AuditLogPage';
import { apiFetch } from '../../lib/api-client';
import { clearSession, setUser } from '../../lib/session';
import type * as ApiClientModule from '../../lib/api-client';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiClientModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ value, ref }: { value: string; ref: Ref<HTMLCanvasElement> }) => (
    <canvas ref={ref} role="img" aria-label="Personnel invitation QR code" data-value={value} />
  ),
}));
const invitation = {
  url: 'https://agapay.example/reset-password?token=example-invite',
  expiresAt: '2026-10-22T12:00:00.000Z',
};
const user = {
  id: '9bedf415-7938-4f57-becd-57ff553cc273',
  name: 'Personnel One',
  email: 'personnel@example.com',
  role: 'STAFF',
  phone: null,
  emailVerified: false,
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-10-01T00:00:00Z',
};
function show(page: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  clearSession();
});
beforeEach(() => {
  vi.resetAllMocks();
});

describe('M5D admin tools', () => {
  it('resends through the existing verification endpoint without marking the donor verified', async () => {
    setUser({ ...user, role: 'ADMIN' });
    vi.mocked(apiFetch).mockImplementation((_path, options) =>
      options?.method === 'POST'
        ? Promise.resolve(undefined)
        : Promise.resolve({
            data: { items: [{ ...user, role: 'DONOR' }], page: 1, pageSize: 25, total: 1 },
          }),
    );
    show(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resend verification' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/auth/resend-verification', {
        method: 'POST',
        body: { email: user.email },
      }),
    );
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/verify-email'),
      expect.anything(),
    );
  });

  it('shows verification source and ownership method separately from delivery', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        items: [
          {
            ...user,
            emailVerified: true,
            verificationSource: 'ADMIN',
            verificationMethod: 'PHONE_CALL',
            emailVerifiedAt: '2026-10-26T01:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
      },
    });
    show(<UsersPage />);
    expect(await screen.findByText(/Confirmed by administrator/)).toHaveTextContent('Phone call');
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    '%s confirms donor verification and refreshes its status',
    async (role) => {
      setUser({ ...user, role });
      const donor = { ...user, name: 'Donor One', role: 'DONOR' as const };
      let verified = false;
      vi.mocked(apiFetch).mockImplementation((_path, options) => {
        if (options?.method === 'POST') {
          verified = true;
          return Promise.resolve({ data: { ...donor, emailVerified: true } });
        }
        return Promise.resolve({
          data: { items: [{ ...donor, emailVerified: verified }], page: 1, pageSize: 25, total: 1 },
        });
      });
      show(<UsersPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Verify email' }));
      expect(apiFetch).not.toHaveBeenCalledWith(expect.anything(), { method: 'POST' });
      expect(screen.getByRole('dialog', { name: 'Verify donor email?' })).toHaveTextContent(
        /another trusted channel/,
      );
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify email' }),
      ).toBeDisabled();
      fireEvent.change(screen.getByLabelText('How was ownership checked?'), {
        target: { value: 'PHONE_CALL' },
      });
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Verify donor email?' })).getByRole('button', {
          name: 'Verify email',
        }),
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Donor email verified.'));
      expect(apiFetch).toHaveBeenCalledWith(`/api/v1/users/${donor.id}/verify-email`, {
        method: 'POST',
        body: { method: 'PHONE_CALL' },
      });
      await waitFor(() => expect(screen.getByText('Verified')).toBeInTheDocument());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('retains the confirmation after failure and blocks duplicate pending verification', async () => {
    setUser({ ...user, role: 'ADMIN' });
    let rejectVerification: (error: Error) => void = () => {};
    vi.mocked(apiFetch).mockImplementation((_path, options) => {
      if (options?.method === 'POST')
        return new Promise((_resolve, reject) => {
          rejectVerification = reject;
        });
      return Promise.resolve({
        data: { items: [{ ...user, role: 'DONOR' }], page: 1, pageSize: 25, total: 1 },
      });
    });
    show(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verify email' }));
    fireEvent.change(screen.getByLabelText('How was ownership checked?'), {
      target: { value: 'IN_PERSON' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Verify donor email?' })).getByRole('button', {
        name: 'Verify email',
      }),
    );
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Verifying…' }));
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(1);
    rejectVerification(new Error('Account changed. Reload before verifying.'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Account changed. Reload before verifying.'),
    );
    expect(screen.getByRole('dialog', { name: 'Verify donor email?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('hides verification for personnel, verified donors, and disabled donors', async () => {
    setUser({ ...user, role: 'ADMIN' });
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        items: [
          user,
          {
            ...user,
            id: 'f65ca43d-45d5-4896-ad93-bda5f31e99df',
            role: 'DONOR',
            emailVerified: true,
          },
          { ...user, id: '2191e549-bcce-494d-8e2e-16b132ce730b', role: 'DONOR', isActive: false },
        ],
        page: 1,
        pageSize: 25,
        total: 3,
      },
    });
    show(<UsersPage />);
    await screen.findByText('User accounts');
    expect(screen.queryByRole('button', { name: 'Verify email' })).not.toBeInTheDocument();
  });

  it('creates personnel using an invitation without choosing a password', async () => {
    vi.mocked(apiFetch).mockImplementation((_path, options) =>
      Promise.resolve(
        options?.method === 'POST'
          ? { data: user, invitation }
          : { data: { items: [], page: 1, pageSize: 25, total: 0 } },
      ),
    );
    show(<UsersPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add personnel' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: user.name } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: user.email } });
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/v1/users',
        expect.objectContaining({
          method: 'POST',
          body: { name: user.name, email: user.email, role: 'STAFF' },
        }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Account created. A set-password invitation is queued.',
      ),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Share personnel invitation' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Invitation link')).toHaveValue(invitation.url);
    expect(screen.getByRole('img', { name: 'Personnel invitation QR code' })).toHaveAttribute(
      'data-value',
      invitation.url,
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invitation link copied.'));
    expect(writeText).toHaveBeenCalledWith(invitation.url);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows a regenerated invitation and provides manual copy when clipboard fails', async () => {
    vi.mocked(apiFetch).mockImplementation((_path, options) =>
      Promise.resolve(
        options?.method === 'POST'
          ? { data: invitation }
          : { data: { items: [user], page: 1, pageSize: 25, total: 1 } },
      ),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Unavailable')) },
    });
    show(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate invitation' }));
    await screen.findByRole('dialog', { name: 'Share personnel invitation' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Copy is unavailable. Select the invitation link and copy it manually.',
      ),
    );
    expect(screen.getByLabelText('Invitation link')).toHaveValue(invitation.url);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,example');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Download QR' }));
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(click).toHaveBeenCalled();
    toDataURL.mockRestore();
    click.mockRestore();
  });

  it('shows save failures without losing the account form', async () => {
    vi.mocked(apiFetch).mockImplementation((_path, options) => {
      if (options?.method === 'PATCH')
        return Promise.reject(new Error('Account changed. Review it.'));
      return Promise.resolve({ data: { items: [user], page: 1, pageSize: 25, total: 1 } });
    });
    show(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Personnel One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account changed. Review it.'));
    expect(screen.getByLabelText('Name')).toHaveValue(user.name);
  });

  it('keeps self-demotion and self-disable controls unavailable', async () => {
    const admin = { ...user, role: 'ADMIN' as const };
    setUser(admin);
    vi.mocked(apiFetch).mockResolvedValue({
      data: { items: [admin], page: 1, pageSize: 25, total: 1 },
    });
    show(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Personnel One' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[name="role"]')).toBeDisabled();
    expect(dialog.querySelector('[name="isActive"]')).toBeDisabled();
  });

  it('saves versioned settings and explains retention behavior', async () => {
    setUser({ ...user, role: 'SUPER_ADMIN' });
    const values = {
      emailDailyLimit: 90,
      emailHourlyLimit: 60,
      lowStockDefault: 20,
      retentionMonths: 12,
      revision: 0,
    };
    vi.mocked(apiFetch).mockImplementation((_path, options) =>
      Promise.resolve({
        data: { ...values, revision: options?.method === 'PATCH' ? 1 : 0 },
      }),
    );
    show(<SettingsPage />);
    expect(screen.getByText(/Automatic anonymisation is not enabled/)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Daily email limit'), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/settings', {
        method: 'PATCH',
        body: { ...values, emailDailyLimit: 75 },
      }),
    );
  });

  it('keeps Admin settings read-only and hides saving', async () => {
    setUser({ ...user, role: 'ADMIN' });
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        emailDailyLimit: 90,
        emailHourlyLimit: 60,
        lowStockDefault: 20,
        retentionMonths: 12,
        revision: 0,
      },
    });
    show(<SettingsPage />);
    expect(await screen.findByLabelText('Daily email limit')).toBeDisabled();
    expect(screen.getByLabelText('Rolling hourly email limit')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only. Contact a Super Admin/)).toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(
      false,
    );
  });
  it('prevents Admin editing or inviting a Super Admin', async () => {
    setUser({ ...user, role: 'ADMIN' });
    vi.mocked(apiFetch).mockResolvedValue({
      data: { items: [{ ...user, role: 'SUPER_ADMIN' }], page: 1, pageSize: 25, total: 1 },
    });
    show(<UsersPage />);
    expect(await screen.findByRole('button', { name: 'Edit Personnel One' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Regenerate invitation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add personnel' }));
    expect(screen.queryByRole('option', { name: 'Super Admin' })).not.toBeInTheDocument();
  });

  it('uses audit cursors and resets pagination when filters change', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        items: [
          {
            id: 'audit-1',
            action: 'user.update',
            entityType: 'User',
            entityId: user.id,
            actorId: null,
            actorName: null,
            createdAt: user.createdAt,
          },
        ],
        nextCursor: 'next-page',
      },
    });
    show(<AuditLogPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('cursor=next-page')),
    );
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'user.update' } });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenLastCalledWith(expect.stringContaining('action=user.update')),
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
});
