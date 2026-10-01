import { env } from '../../../lib/env.js';
import type { EmailProvider } from './email-provider.js';
import { createConsoleProvider } from './console-provider.js';
import { createResendProvider } from './resend-provider.js';

export function createEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === 'resend') {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('EMAIL_PROVIDER is "resend" but RESEND_API_KEY is missing');
    }
    return createResendProvider({ apiKey, from: env.EMAIL_FROM });
  }
  return createConsoleProvider();
}
