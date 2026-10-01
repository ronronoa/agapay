import type { RequestStatus } from './enums.js';

// `satisfies Record<RequestStatus, string>` so a new status fails to compile
// until it has beneficiary wording (TS-08).
export const requestStatusMessages = {
  PENDING: 'We received your request. It is waiting to be reviewed.',
  UNDER_REVIEW: 'An administrator is reviewing your request.',
  APPROVED: 'Your request was approved. Watch your email for the pickup details.',
  REJECTED:
    'Your request was not approved. Check the reason below and contact the administrators if you think this is a mistake.',
  SCHEDULED: 'Your goods are ready. Please come on the date and place below.',
  DISTRIBUTED: 'Your goods were released. Thank you.',
  CANCELLED: 'This request was cancelled.',
} as const satisfies Record<RequestStatus, string>;

export type RequestStatusMessageKey = keyof typeof requestStatusMessages;

/** Safe lookup for DTOs, where the status may be untrusted or widened. */
export function requestStatusMessage(status: RequestStatus): string {
  return requestStatusMessages[status];
}
