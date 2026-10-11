import type { Request } from 'express';
import { validationError } from '../errors.js';

/**
 * Express 5 types a route param as `string | string[]`, so a repeated or
 * bracketed segment arrives as an array. Reject it rather than coercing.
 */
export function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value === 'string' && value.length > 0) return value;
  throw validationError({ [name]: 'Required path parameter is missing or malformed.' });
}
