import type { AuthUserDto } from '@agapay/shared';

const TOKEN_KEY = 'agapay.accessToken';

let accessToken: string | null = null;
let currentUser: AuthUserDto | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

// SessionStorage, not localStorage: rules.md section 127 keeps the access token
// out of persistent storage. Survives a reload so a refresh does not look like a
// logout, and clears when the tab closes.
function readStored(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStored(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private browsing can refuse storage; the in-memory copy still works.
  }
}

accessToken = readStored();

export function getAccessToken(): string | null {
  return accessToken;
}

export function getUser(): AuthUserDto | null {
  return currentUser;
}

export function isAuthenticated(): boolean {
  return accessToken !== null;
}

export function setSession(token: string, user: AuthUserDto): void {
  accessToken = token;
  currentUser = user;
  writeStored(token);
  notify();
}

export function setUser(user: AuthUserDto): void {
  currentUser = user;
  notify();
}

export function clearSession(): void {
  accessToken = null;
  currentUser = null;
  writeStored(null);
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
