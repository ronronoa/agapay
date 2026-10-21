import { describe, expect, it } from 'vitest';
import { createSmtpProvider, type SmtpMessage } from './smtp-provider.js';

const options = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: 'sender@gmail.com',
  pass: 'app-password-1234',
  from: 'Agapay <sender@gmail.com>',
};

const input = {
  to: 'donor@example.com',
  subject: 'Confirm your Agapay email address',
  html: '<p>Confirm</p>',
  text: 'Confirm',
};

describe('smtp provider', () => {
  it('maps the message fields and returns the provider message id', async () => {
    let seen: SmtpMessage | undefined;
    const provider = createSmtpProvider({
      ...options,
      sendMail: (message) => {
        seen = message;
        return Promise.resolve({ messageId: '<abc123@mail.gmail.com>' });
      },
    });

    const result = await provider.send(input);

    expect(seen).toEqual({ from: options.from, ...input });
    expect(result.providerMessageId).toBe('<abc123@mail.gmail.com>');
  });

  it('passes the calendar attachment to the SMTP transport', async () => {
    let seen: SmtpMessage | undefined;
    const provider = createSmtpProvider({
      ...options,
      sendMail: (message) => {
        seen = message;
        return Promise.resolve({ messageId: 'calendar-test' });
      },
    });
    const attachments = [
      {
        filename: 'schedule.ics',
        content: 'BEGIN:VCALENDAR',
        contentType: 'text/calendar; charset=utf-8',
      },
    ];
    await provider.send({ ...input, attachments });
    expect(seen?.attachments).toEqual(attachments);
  });

  it('turns a transport failure into a plain error with no credentials', async () => {
    const failure = Object.assign(new Error(`535 auth failed for ${options.pass}`), {
      code: 'EAUTH',
    });
    const provider = createSmtpProvider({ ...options, sendMail: () => Promise.reject(failure) });

    const error: unknown = await provider.send(input).catch((err: unknown) => err);
    const message = error instanceof Error ? error.message : '';

    expect(message).toBe('SMTP send failed (EAUTH)');
    expect(message).not.toContain(options.pass);
  });

  it('uses UNKNOWN when the transport error carries no code', async () => {
    const provider = createSmtpProvider({
      ...options,
      sendMail: () => Promise.reject(new Error('connection closed')),
    });

    await expect(provider.send(input)).rejects.toThrow('SMTP send failed (UNKNOWN)');
  });
});
