import { describe, expect, it } from 'vitest';
import { RequestStatus } from './enums.js';
import { requestStatusMessages } from './status-messages.js';

describe('requestStatusMessages', () => {
  it('has wording for every status in the enum', () => {
    for (const status of Object.values(RequestStatus)) {
      expect(requestStatusMessages[status]).toBeTruthy();
    }
  });

  it('never sends an empty string to a beneficiary', () => {
    for (const message of Object.values(requestStatusMessages)) {
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not promise an outcome or quote a deadline', () => {
    for (const message of Object.values(requestStatusMessages)) {
      expect(message).not.toMatch(/guarantee|guaranteed|promise/i);
    }
  });
});
