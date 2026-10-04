import type { UserRole } from '@agapay/shared';

export interface AuthContext {
  userId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
