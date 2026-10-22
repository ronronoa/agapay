import { describe, expect, it } from 'vitest';
import {
  liveAuthSchema,
  liveFrameSchema,
  sendSupportMessageSchema,
  supportMessagesQuerySchema,
} from './support.js';
describe('support trust boundaries', () => {
  it('bounds plain text and requires an idempotent client identifier', () => {
    const clientMessageId = '00000000-0000-4000-8000-000000000001';
    expect(sendSupportMessageSchema.parse({ body: ' hello\nworld ', clientMessageId }).body).toBe(
      'hello\nworld',
    );
    for (const body of ['', ' ', 'x'.repeat(4001)])
      expect(sendSupportMessageSchema.safeParse({ body, clientMessageId }).success).toBe(false);
    expect(
      sendSupportMessageSchema.safeParse({ body: 'hello', clientMessageId, senderId: 'forged' })
        .success,
    ).toBe(false);
  });
  it('rejects arbitrary channel subscriptions and payloads in live frames', () => {
    expect(
      liveAuthSchema.safeParse({ type: 'authenticate', ticket: 'x'.repeat(43), userId: 'forged' })
        .success,
    ).toBe(false);
    expect(liveFrameSchema.safeParse({ type: 'event', sequence: -1 }).success).toBe(false);
    expect(supportMessagesQuerySchema.safeParse({ before: 2, after: 0 }).success).toBe(false);
  });
});
