// Business code depends on this, never a vendor SDK (OPS-05).
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative is always required (SEC-06). */
  text: string;
  /** Correlates a send with its outbox row; not sent to the provider. */
  dedupeKey?: string;
}

export interface SendEmailResult {
  providerMessageId: string | undefined;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export const SEND_TIMEOUT_MS = 10_000;

// The request is not cancelled, only the wait on it (TS-17).
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
