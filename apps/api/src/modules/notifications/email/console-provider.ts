import { logger } from '../../../lib/logger.js';
import type { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.js';

// Lets the outbox drain in dev without a provider. The recipient is logged as
// a placeholder because the address is personal data.
export function createConsoleProvider(): EmailProvider {
  return {
    send(input: SendEmailInput): Promise<SendEmailResult> {
      logger.info(
        { subject: input.subject, dedupeKey: input.dedupeKey, to: '[redacted]' },
        'console email provider: message not sent',
      );
      return Promise.resolve({ providerMessageId: `console-${input.dedupeKey ?? 'adhoc'}` });
    },
  };
}
