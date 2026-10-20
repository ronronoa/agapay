import nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider.js';
import { SEND_TIMEOUT_MS, withTimeout } from './email-provider.js';

export interface SmtpMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SmtpProviderOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** Test seam: a fake, so no test opens a socket (TEST-02). */
  sendMail?: (message: SmtpMessage) => Promise<{ messageId: string }>;
}

function createSmtpSend(
  options: SmtpProviderOptions,
): (message: SmtpMessage) => Promise<{ messageId: string }> {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: { user: options.user, pass: options.pass },
    // The password must never cross a plaintext hop.
    requireTLS: !options.secure,
    // withTimeout abandons the wait, not the socket, so the connection itself
    // also needs a deadline or a dead peer leaks a connection per send.
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  return async (message) => {
    const info = await transport.sendMail(message);
    return { messageId: info.messageId };
  };
}

// The SMTP response can echo the envelope, and the stack can carry the auth
// object, so only a coarse code reaches lastError.
function toPlainError(err: unknown): Error {
  const code =
    err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : 'UNKNOWN';
  return new Error(`SMTP send failed (${code})`, { cause: err });
}

export function createSmtpProvider(options: SmtpProviderOptions): EmailProvider {
  const send = options.sendMail ?? createSmtpSend(options);

  return {
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const { messageId } = await withTimeout(
        send({
          from: options.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        SEND_TIMEOUT_MS,
        'smtp send',
      ).catch((err: unknown) => {
        throw toPlainError(err);
      });
      return { providerMessageId: messageId };
    },
  };
}
