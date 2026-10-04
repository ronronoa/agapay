import { pino } from 'pino';
import { env, isProduction } from './env.js';

// Redact by key, not by value: values are unbounded. Beneficiary names, emails,
// phone numbers, and auth material must never reach the log sink (OPS-07).
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'dedupeKey',
  'email',
  'toEmail',
  'emailAddress',
  'phone',
  'contactNumber',
  'fullName',
  'name',
  'notes',
];

export const logger = pino({
  level: isProduction ? env.LOG_LEVEL : 'debug',
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: { service: 'agapay-api' },
});
