import { env } from '../../../lib/env.js';
import type { EmailProvider } from './email-provider.js';
export type { EmailProvider } from './email-provider.js';
import { createConsoleProvider } from './console-provider.js';
import { createResendProvider } from './resend-provider.js';
import { createSmtpProvider } from './smtp-provider.js';

export function createEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === 'resend') {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('EMAIL_PROVIDER is "resend" but RESEND_API_KEY is missing');
    }
    return createResendProvider({ apiKey, from: env.EMAIL_FROM });
  }
  if (env.EMAIL_PROVIDER === 'smtp') {
    const user = env.SMTP_USER;
    const pass = env.SMTP_PASS;
    if (!user || !pass) {
      throw new Error('EMAIL_PROVIDER is "smtp" but SMTP_USER or SMTP_PASS is missing');
    }
    return createSmtpProvider({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user,
      pass,
      from: env.EMAIL_FROM,
    });
  }
  return createConsoleProvider();
}
