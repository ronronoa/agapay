import type { NotificationType } from '@agapay/shared';
import { internal } from '../../../lib/errors.js';

export const VERIFY_EMAIL_PATH = '/verify-email';
export const RESET_PASSWORD_PATH = '/reset-password';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(data: unknown, key: string): string {
  if (!isRecord(data)) throw internal('Email template data is malformed.');

  const value: unknown = data[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw internal('Email template data is malformed.');
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>""']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function notImplemented(type: NotificationType): never {
  throw internal(`Email template for ${type} is not implemented yet.`);
}

export function renderEmail(
  type: NotificationType,
  templateData: unknown,
  webOrigin: string,
): RenderedEmail {
  switch (type) {
    case 'DONOR_VERIFY_EMAIL': {
      const name = field(templateData, 'name');
      const token = field(templateData, 'token');
      const link = `${webOrigin}${VERIFY_EMAIL_PATH}?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Confirm your Agapay email address',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Thanks for registering with Agapay. Please confirm your email address within 24 hours:</p>` +
          `<p><a href="${escapeHtml(link)}">Confirm my email address</a></p>` +
          `<p>If you did not register, you can ignore this email.</p>`,
        text:
          `Hi ${name},\n\nThanks for registering with Agapay. ` +
          `Please confirm your email address within 24 hours:\n${link}\n\n` +
          `If you did not register, you can ignore this email.`,
      };
    }
    case 'DONOR_PASSWORD_RESET': {
      const name = field(templateData, 'name');
      const token = field(templateData, 'token');
      const link = `${webOrigin}${RESET_PASSWORD_PATH}?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Reset your Agapay password',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>We received a password reset request for your Agapay account:</p>` +
          `<p><a href="${escapeHtml(link)}">Reset my password</a></p>` +
          `<p>If you did not ask for this, you can ignore this email.</p>`,
        text:
          `Hi ${name},\n\nWe received a password reset request for your Agapay account:\n${link}\n\n` +
          `If you did not ask for this, you can ignore this email.`,
      };
    }
    case 'COLLECTION_REMINDER':
    case 'COLLECTION_SCHEDULED':
    case 'DISTRIBUTION_CANCELLED':
    case 'DISTRIBUTION_COMPLETED':
    case 'DISTRIBUTION_REMINDER':
    case 'DISTRIBUTION_SCHEDULED':
    case 'DONATION_REJECTED':
    case 'DONATION_SUBMITTED':
    case 'DONATION_VERIFIED':
    case 'REQUEST_APPROVED':
    case 'REQUEST_RECEIVED':
    case 'REQUEST_REJECTED':
    case 'REQUEST_STATUS_UPDATED':
    case 'REQUEST_VERIFY_EMAIL':
      return notImplemented(type);
    default:
      return notImplemented(type);
  }
}
