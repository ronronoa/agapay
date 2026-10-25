import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../lib/session';
import { restoreSession } from '../../lib/auth-api';
import { AuthGate } from './AuthGate';

vi.mock('../../lib/auth-api', () => ({ restoreSession: vi.fn() }));
afterEach(() => {
  clearSession();
  vi.resetAllMocks();
});
const user = {
  id: 'staff',
  name: 'Fixture',
  email: 'fixture@example.invalid',
  role: 'STAFF',
  phone: null,
  emailVerified: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};
function show() {
  return render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route
          path="/private"
          element={
            <AuthGate roles={['STAFF', 'ADMIN']}>
              <p>Private operations</p>
            </AuthGate>
          }
        />
        <Route path="/login" element={<p>Sign in</p>} />
        <Route path="/forbidden" element={<p>Access denied</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('AuthGate recovery and access', () => {
  it('recovers from an offline session check without exposing protected content', async () => {
    vi.mocked(restoreSession)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockImplementationOnce(() => {
        setSession('token', user);
        return Promise.resolve(user);
      });
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your session');
    expect(screen.queryByText('Private operations')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Private operations');
    expect(restoreSession).toHaveBeenCalledTimes(2);
  });
  it('redirects a missing session to sign in', async () => {
    vi.mocked(restoreSession).mockResolvedValue(null);
    show();
    await screen.findByText('Sign in');
  });
  it('denies donors and reacts to a role change while mounted', async () => {
    setSession('token', user);
    show();
    expect(screen.getByText('Private operations')).toBeInTheDocument();
    act(() => setSession('donor-token', { ...user, role: 'DONOR' }));
    await waitFor(() => expect(screen.getByText('Access denied')).toBeInTheDocument());
  });
});
