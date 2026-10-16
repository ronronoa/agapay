import type { AuthUserDto } from '@agapay/shared';

// One rule for every "Donate Goods" link: donating needs a donor account, so
// visitors go to registration while signed-in donors go to the donation form.
export function donateTarget(user: AuthUserDto | null): string {
  return user !== null && user.role === 'DONOR' ? '/donate' : '/register';
}
