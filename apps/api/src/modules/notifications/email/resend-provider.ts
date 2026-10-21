import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.js';
import { SEND_TIMEOUT_MS, withTimeout } from './email-provider.js';

export interface ResendProviderOptions {
  apiKey: string;
  from: string;
}

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
          ...(input.attachments
            ? {
                attachments: input.attachments.map((a) => ({
                  filename: a.filename,
                  content: Buffer.from(a.content).toString('base64'),
                  contentType: a.contentType,
                })),
              }
            : {}),
        }),
        SEND_TIMEOUT_MS,
        'resend send',
      );

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
