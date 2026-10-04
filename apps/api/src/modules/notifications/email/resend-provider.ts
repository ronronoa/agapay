import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.js';
import { SEND_TIMEOUT_MS, withTimeout } from './email-provider.js';

export interface ResendProviderOptions {
  apiKey: string;
  from: string;
}

// No retry here on purpose: the worker owns the retry policy and records each
// attempt on the outbox row, where admins can see it (OPS-03).
export function createResendProvider(options: ResendProviderOptions): EmailProvider {
  const client = new Resend(options.apiKey);

  return {
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const response = await withTimeout(
        client.emails.send({
          from: options.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        SEND_TIMEOUT_MS,
        'resend send',
      );

      // The SDK reports failures in-band rather than by throwing.
      if (response.error) {
        throw new Error(`Resend rejected the message: ${response.error.message}`);
      }
      if (!response.data?.id) {
        throw new Error('Resend returned no message id');
      }
      return { providerMessageId: response.data.id };
    },
  };
}
