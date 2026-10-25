import { describe, expect, it } from 'vitest';
import { hasRole } from './enums.js';
import { authUserSchema, registerSchema } from './auth.js';

describe('management role inheritance', () => {
  it('grants Super Admin management access without donor impersonation', () => {
    expect(hasRole('SUPER_ADMIN', ['ADMIN', 'STAFF'])).toBe(true);
    expect(hasRole('SUPER_ADMIN', ['SUPER_ADMIN'])).toBe(true);
    expect(hasRole('SUPER_ADMIN', ['DONOR'])).toBe(false);
    expect(hasRole('ADMIN', ['SUPER_ADMIN'])).toBe(false);
    expect(hasRole(undefined, ['ADMIN'])).toBe(false);
  });
  it('validates known account roles and refuses public privilege injection', () => {
    expect(authUserSchema.shape.role.safeParse('SUPER_ADMIN').success).toBe(true);
    expect(authUserSchema.shape.role.safeParse('OWNER').success).toBe(false);
    expect(
      registerSchema.safeParse({
        name: 'Fixture',
        email: 'fixture@example.invalid',
        password: 'long fixture password',
        role: 'SUPER_ADMIN',
      }).success,
    ).toBe(false);
  });
});
