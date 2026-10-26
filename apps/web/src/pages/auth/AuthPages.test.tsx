import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RegisterPage } from './RegisterPage';
import { LoginPage } from './LoginPage';
import { VerifyEmailPage } from './VerifyEmailPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { apiFetch, ApiClientError } from '../../lib/api-client';
import { toast } from 'sonner';
import { clearSession } from '../../lib/session';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
});
afterEach(() => clearSession());

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

function renderWith(ui: ReactElement, entry = '/'): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
  it('offers donor registration and a separate account-free assistance link', () => {
    renderWith(<RegisterPage />);
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request assistance' })).toHaveAttribute(
      'href',
      '/request-assistance',
    );
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Choose a role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('blocks mismatched passwords without calling the API', async () => {
    renderWith(<RegisterPage />);
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Juan Dela Cruz' } });
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'juan@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-enough-password-1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different-password-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => expect(screen.getByText('Passwords do not match.')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Confirm Password')).toHaveFocus());
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it('shows the inbox screen after registering', async () => {
    renderWith(<RegisterPage />);
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Juan Dela Cruz' } });
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'juan@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-enough-password-1' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'long-enough-password-1' },
    });
    vi.mocked(apiFetch).mockResolvedValue({
      data: { id: 'u-1', email: 'juan@example.com', emailVerified: false },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => expect(screen.getByText('Check your inbox')).toBeInTheDocument());
  });

  it('keeps registration pending through the API response and preserves its draft on failure', async () => {
    let reject: ((reason: Error) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderWith(<RegisterPage />);
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Fixture Donor' } });
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'fixture@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long fixture password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'long fixture password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    const pending = await screen.findByRole('button', { name: 'Signing up…' });
    expect(pending).toBeDisabled();
    expect(screen.getByLabelText('Full Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    fireEvent.click(pending);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    reject?.(new Error('Offline'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Full Name')).toHaveValue('Fixture Donor');
    expect(screen.getByLabelText('Confirm Password')).toHaveValue('long fixture password');
    expect(screen.getByLabelText('Full Name')).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it.each(['DONOR', 'STAFF', 'ADMIN', 'SUPER_ADMIN'] as const)(
    'retains dashboard routing for %s',
    async (role) => {
      vi.mocked(apiFetch).mockResolvedValue({
        data: {
          accessToken: 'fixture-token',
          expiresIn: 900,
          user: {
            id: 'fixture',
            name: 'Fixture',
            email: 'fixture@example.invalid',
            role,
            phone: null,
            emailVerified: true,
            isActive: true,
            createdAt: '2026-01-01T00:00:00Z',
          },
        },
      });
      renderWith(
        <>
          <LoginPage />
          <CurrentPath />
        </>,
      );
      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value: 'fixture@example.invalid' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'fixture password' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await waitFor(() =>
        expect(screen.getByTestId('current-path')).toHaveTextContent(
          role === 'DONOR' ? '/donor' : '/admin',
        ),
      );
      expect(toast.success).toHaveBeenCalledExactlyOnceWith('Signed in.');
    },
  );
  it('links assistance and account recovery from the login page', () => {
    renderWith(<LoginPage />);
    expect(screen.getAllByRole('link', { name: /request assistance/i })[0]).toHaveAttribute(
      'href',
      '/request-assistance',
    );
    expect(screen.getByRole('link', { name: /forgot password\?/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin log in' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('shows server errors without navigating away', async () => {
    const { ApiClientError } = await import('../../lib/api-client');
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiClientError('UNAUTHENTICATED', 'Wrong email or password.', 401, 'req-1', undefined),
    );
    renderWith(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'juan@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Email or password is incorrect.'),
    );
    expect(screen.getByLabelText('Password')).toHaveValue('wrong-password-1');
    expect(screen.queryByText('Wrong email or password.')).not.toBeInTheDocument();
  });

  it('supports password visibility without submitting the login form', () => {
    renderWith(<LoginPage />);
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('blocks duplicate login sends while the response is pending', async () => {
    let reject: ((reason: Error) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderWith(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'fixture@example.invalid' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fixture password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    const pending = await screen.findByRole('button', { name: 'Signing in…' });
    expect(pending).toBeDisabled();
    expect(screen.getByLabelText('Email address')).toBeDisabled();
    fireEvent.click(pending);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    reject?.(new Error('Offline'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('We could not sign you in. Please try again.'),
    );
    expect(screen.getByLabelText('Email address')).toHaveValue('fixture@example.invalid');
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled();
  });
});

describe('VerifyEmailPage', () => {
  it('confirms a valid token', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { verified: true } });
    renderWith(<VerifyEmailPage />, '/verify-email?token=abc12345678901234567890');
    await waitFor(() => expect(screen.getByText('Email confirmed.')).toBeInTheDocument());
  });

  it('explains an incomplete link without calling the API', () => {
    renderWith(<VerifyEmailPage />, '/verify-email');
    expect(screen.getByText('This confirmation link is incomplete.')).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });

  it('offers a neutral resend without confirming that an account exists', async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    renderWith(<VerifyEmailPage />, '/verify-email');
    fireEvent.change(screen.getByLabelText('Email address for verification'), {
      target: { value: 'unknown@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'If the account still needs verification, a new email is queued.',
      ),
    );
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/auth/resend-verification', {
      method: 'POST',
      body: { email: 'unknown@example.invalid' },
    });
  });
});

describe('ForgotPasswordPage', () => {
  it('keeps an unsuccessful recovery draft and prevents duplicate pending sends', async () => {
    let reject: ((error: Error) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderWith(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'fixture@example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    const button = await screen.findByRole('button', { name: 'Sending…' });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Email Address')).toBeDisabled();
    fireEvent.click(button);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    reject?.(new Error('Offline'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Email Address')).toHaveValue('fixture@example.invalid');
  });

  it('answers identically without leaking account existence', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    renderWith(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() =>
      expect(screen.getByText(/a reset link is on its way/i)).toBeInTheDocument(),
    );
  });
});

describe('ResetPasswordPage', () => {
  it('sets a new password from a link token', async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    renderWith(<ResetPasswordPage />, '/reset-password?token=tok12345678901234567890');
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'brand-new-password-9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'brand-new-password-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.getByText(/Password changed/)).toBeInTheDocument());
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      '/api/v1/auth/reset-password',
      expect.objectContaining({
        body: { token: 'tok12345678901234567890', password: 'brand-new-password-9' },
      }),
    );
  });

  it('blocks mismatched passwords without submitting', async () => {
    renderWith(<ResetPasswordPage />, '/reset-password?token=tok12345678901234567890');
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'brand-new-password-9' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'different-password-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('provides recovery and invitation guidance for incomplete links', () => {
    renderWith(<ResetPasswordPage />, '/reset-password');
    expect(screen.getByText('This reset link is incomplete.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByText(/ask an administrator to regenerate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('handles expired invitations without repeated invalid submissions', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiClientError('CONFLICT', 'Expired', 409, undefined, undefined),
    );
    renderWith(<ResetPasswordPage />, '/reset-password?token=tok12345678901234567890');
    for (const label of ['New Password', 'Confirm Password'])
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'brand-new-password-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/This password link cannot be used/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledOnce();
  });

  it('disables password controls while pending and preserves the draft after a network failure', async () => {
    let reject: ((error: Error) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderWith(<ResetPasswordPage />, '/reset-password?token=tok12345678901234567890');
    for (const label of ['New Password', 'Confirm Password'])
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'brand-new-password-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    const button = await screen.findByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    fireEvent.click(button);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    reject?.(new Error('Offline'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('New Password')).toHaveValue('brand-new-password-9');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeEnabled();
  });
});
