import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RegisterPage } from './RegisterPage';
import { LoginPage } from './LoginPage';
import { VerifyEmailPage } from './VerifyEmailPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWith(ui: ReactElement, entry = '/'): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegisterPage', () => {
  it('follows the donor mockup with role toggle and confirm check', () => {
    renderWith(<RegisterPage />);
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beneficiary' })).toHaveAttribute('href', '/track');
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
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
});

describe('LoginPage', () => {
  it('routes the beneficiary toggle at tracking, not a login', () => {
    renderWith(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Beneficiary' })).toHaveAttribute('href', '/track');
    expect(screen.getByRole('link', { name: 'Forgot Password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows server errors without navigating away', async () => {
    const { ApiClientError } = await import('../../lib/api-client');
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiClientError('UNAUTHENTICATED', 'Wrong email or password.', 401, 'req-1', undefined),
    );
    renderWith(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email Address'), {
      target: { value: 'juan@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await waitFor(() => expect(screen.getByText('Wrong email or password.')).toBeInTheDocument());
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
});

describe('ForgotPasswordPage', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.getByText(/Password changed/)).toBeInTheDocument());
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      '/api/v1/auth/reset-password',
      expect.objectContaining({
        body: { token: 'tok12345678901234567890', password: 'brand-new-password-9' },
      }),
    );
  });
});
