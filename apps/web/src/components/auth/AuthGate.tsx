import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole as UserRoleType } from '@agapay/shared';
import { getUser, subscribe } from '../../lib/session';
import { restoreSession } from '../../lib/auth-api';
import { ErrorState } from '../ui/ErrorState';

interface AuthGateProps {
  children: ReactNode;
  roles?: readonly UserRoleType[];
}

// Restores the session once at mount, then re-reads it on every store change so
// a logout or a failed refresh redirects without a page reload.
export function AuthGate({ children, roles }: AuthGateProps) {
  const location = useLocation();
  const [user, setUser] = useState(getUser());
  const [checking, setChecking] = useState(user === null);
  const [error, setError] = useState(false);

  useEffect(() => subscribe(() => setUser(getUser())), []);

  const refresh = useCallback(async () => {
    setChecking(true);
    setError(false);
    try {
      setUser(await restoreSession());
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (user === null) void refresh();
  }, [refresh, user]);

  if (checking) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Checking your session…
      </p>
    );
  }

  if (error)
    return (
      <ErrorState
        message="Could not check your session. Check your connection and try again."
        onRetry={() => void refresh()}
      />
    );

  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles !== undefined && !roles.some((role) => role === user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
