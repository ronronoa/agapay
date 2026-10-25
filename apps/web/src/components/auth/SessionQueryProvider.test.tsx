import type { AuthUserDto } from '@agapay/shared';
import { act, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, getUser, setSession } from '../../lib/session';
import { SessionQueryProvider } from './SessionQueryProvider';

const user: AuthUserDto = {
  id: 'first',
  name: 'Fixture',
  email: 'fixture@example.invalid',
  role: 'STAFF',
  phone: null,
  emailVerified: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};
afterEach(() => clearSession());
describe('session query isolation', () => {
  it('never renders another account or role snapshot, and preserves cache on token rotation', async () => {
    const seen: string[] = [];
    let calls = 0;
    function Probe() {
      const query = useQuery({
        queryKey: ['private-snapshot'],
        queryFn: () => {
          calls++;
          return Promise.resolve(`${getUser()?.id}:${getUser()?.role}`);
        },
      });
      const value = query.data ?? 'Loading';
      seen.push(value);
      return <p>{value}</p>;
    }
    setSession('token', user);
    render(
      <SessionQueryProvider>
        <Probe />
      </SessionQueryProvider>,
    );
    await screen.findByText('first:STAFF');
    act(() => setSession('rotated-token', { ...user }));
    expect(calls).toBe(1);
    let offset = seen.length;
    act(() => setSession('second-token', { ...user, id: 'second' }));
    await screen.findByText('second:STAFF');
    expect(seen.slice(offset)).not.toContain('first:STAFF');
    offset = seen.length;
    act(() => setSession('second-donor-token', { ...user, id: 'second', role: 'DONOR' }));
    await screen.findByText('second:DONOR');
    expect(seen.slice(offset)).not.toContain('second:STAFF');
    offset = seen.length;
    act(() => clearSession());
    await screen.findByText('undefined:undefined');
    expect(seen.slice(offset)).not.toContain('second:DONOR');
  });
  it('discards an old in-flight response after switching accounts', async () => {
    let finish: ((value: string) => void) | undefined;
    function Probe() {
      const query = useQuery({
        queryKey: ['private-snapshot'],
        queryFn: () =>
          getUser()?.id === 'first'
            ? new Promise<string>((resolve) => {
                finish = resolve;
              })
            : Promise.resolve('Second private data'),
      });
      return <p>{query.data ?? 'Loading'}</p>;
    }
    setSession('first-token', user);
    render(
      <SessionQueryProvider>
        <Probe />
      </SessionQueryProvider>,
    );
    act(() => setSession('second-token', { ...user, id: 'second' }));
    await screen.findByText('Second private data');
    await act(async () => {
      finish?.('First private data');
      await Promise.resolve();
    });
    expect(screen.queryByText('First private data')).not.toBeInTheDocument();
  });
});
