import type { NotificationType } from '@agapay/shared';
import { internal } from '../../../lib/errors.js';

export const VERIFY_EMAIL_PATH = '/verify-email';
export const RESET_PASSWORD_PATH = '/reset-password';
export const REQUEST_VERIFY_PATH = '/verify-request';

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

function manilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
    case 'COLLECTION_SCHEDULED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      const location = field(templateData, 'location');
      const startAt = field(templateData, 'startAt');
      return {
        subject: 'Your donation collection is scheduled',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Your donation ${escapeHtml(referenceNumber)} will be collected on ${escapeHtml(manilaDateTime(startAt))} at ${escapeHtml(location)}.</p>` +
          `<p>Please have the goods packed and ready. Reply to this email if the schedule does not work for you.</p>`,
        text:
          `Hi ${name},\n\nYour donation ${referenceNumber} will be collected on ` +
          `${manilaDateTime(startAt)} at ${location}.\n\n` +
          `Please have the goods packed and ready. Reply to this email if the schedule does not work for you.`,
      };
    }
    case 'DISTRIBUTION_SCHEDULED': {
      const name = field(templateData, 'name');
      const location = field(templateData, 'location');
      const startAt = field(templateData, 'startAt');
      return {
        subject: 'Your goods are ready for pickup',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Your goods are ready. Please come on ${escapeHtml(manilaDateTime(startAt))} at ${escapeHtml(location)}.</p>` +
          `<p>Bring your tracking number and a valid ID.</p>`,
        text:
          `Hi ${name},\n\nYour goods are ready. Please come on ` +
          `${manilaDateTime(startAt)} at ${location}.\n\n` +
          `Bring your tracking number and a valid ID.`,
      };
    }
    case 'DISTRIBUTION_COMPLETED': {
      const name = field(templateData, 'name');
      const trackingNumber = field(templateData, 'trackingNumber');
      return {
        subject: 'Your goods were released',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Your goods for tracking number ${escapeHtml(trackingNumber)} were released. Thank you, and take care.</p>`,
        text: `Hi ${name},\n\nYour goods for tracking number ${trackingNumber} were released. Thank you, and take care.`,
      };
    }
    case 'DISTRIBUTION_CANCELLED': {
      const name = field(templateData, 'name');
      const location = field(templateData, 'location');
      const startAt = field(templateData, 'startAt');
      return {
        subject: 'Your distribution schedule was cancelled',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>The distribution scheduled on ${escapeHtml(manilaDateTime(startAt))} at ${escapeHtml(location)} was cancelled. We will email you a new schedule soon.</p>`,
        text:
          `Hi ${name},\n\nThe distribution scheduled on ` +
          `${manilaDateTime(startAt)} at ${location} was cancelled. We will email you a new schedule soon.`,
      };
    }
    case 'COLLECTION_REMINDER':
    case 'DISTRIBUTION_REMINDER':
    case 'DONATION_SUBMITTED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      return {
        subject: 'We received your donation',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Thanks for supporting relief efforts. Your donation ${escapeHtml(referenceNumber)} is awaiting verification. We will email you once our team reviews it.</p>`,
        text:
          `Hi ${name},\n\nThanks for supporting relief efforts. ` +
          `Your donation ${referenceNumber} is awaiting verification. ` +
          `We will email you once our team reviews it.`,
      };
    }
    case 'DONATION_VERIFIED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      return {
        subject: 'Your donation was verified',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Good news: your donation ${escapeHtml(referenceNumber)} passed verification. We will email you again when collection is scheduled.</p>`,
        text:
          `Hi ${name},\n\nGood news: your donation ${referenceNumber} passed verification. ` +
          `We will email you again when collection is scheduled.`,
      };
    }
    case 'DONATION_REJECTED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      const reason = field(templateData, 'reason');
      return {
        subject: 'Update on your donation',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Thanks for offering to help. We could not accept your donation ${escapeHtml(referenceNumber)} this time:</p>` +
          `<p>${escapeHtml(reason)}</p>` +
          `<p>You are welcome to submit a new donation at any time.</p>`,
        text:
          `Hi ${name},\n\nThanks for offering to help. ` +
          `We could not accept your donation ${referenceNumber} this time:\n${reason}\n\n` +
          `You are welcome to submit a new donation at any time.`,
      };
    }
    case 'REQUEST_RECEIVED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      return {
        subject: 'We received your assistance request',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>We received your assistance request ${escapeHtml(referenceNumber)}. Our team will review it and email you the outcome.</p>`,
        text:
          `Hi ${name},\n\nWe received your assistance request ${referenceNumber}. ` +
          `Our team will review it and email you the outcome.`,
      };
    }
    case 'REQUEST_VERIFY_EMAIL': {
      const name = field(templateData, 'name');
      const token = field(templateData, 'token');
      return {
        subject: 'Confirm your email for your assistance request',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Please confirm your email address so we can reach you about your request:</p>` +
          `<p><a href="${escapeHtml(`${webOrigin}${REQUEST_VERIFY_PATH}?token=${encodeURIComponent(token)}`)}">Confirm my email address</a></p>` +
          `<p>If you did not submit a request, you can ignore this email.</p>`,
        text:
          `Hi ${name},\n\nPlease confirm your email address so we can reach you about your request:\n` +
          `${webOrigin}${REQUEST_VERIFY_PATH}?token=${encodeURIComponent(token)}\n\n` +
          `If you did not submit a request, you can ignore this email.`,
      };
    }
    case 'REQUEST_APPROVED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      const trackingNumber = field(templateData, 'trackingNumber');
      return {
        subject: 'Your assistance request was approved',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Good news: your assistance request ${escapeHtml(referenceNumber)} was approved.</p>` +
          `<p>Your tracking number is <strong>${escapeHtml(trackingNumber)}</strong>. Keep it together with your email address to follow your request.</p>`,
        text:
          `Hi ${name},\n\nGood news: your assistance request ${referenceNumber} was approved.\n` +
          `Your tracking number is ${trackingNumber}. Keep it together with your email address to follow your request.`,
      };
    }
    case 'REQUEST_REJECTED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      const reason = field(templateData, 'reason');
      return {
        subject: 'Update on your assistance request',
        html:
          `<p>Hi ${escapeHtml(name)},</p>` +
          `<p>Thanks for reaching out. We could not approve your request ${escapeHtml(referenceNumber)} this time:</p>` +
          `<p>${escapeHtml(reason)}</p>` +
          `<p>If you think this is a mistake, please contact our team.</p>`,
        text:
          `Hi ${name},\n\nThanks for reaching out. ` +
          `We could not approve your request ${referenceNumber} this time:\n${reason}\n\n` +
          `If you think this is a mistake, please contact our team.`,
      };
    }
    case 'REQUEST_STATUS_UPDATED':
      return notImplemented(type);
    default:
      return notImplemented(type);
  }
}
