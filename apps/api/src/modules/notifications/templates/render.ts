import type { NotificationType } from '@agapay/shared';
import { internal } from '../../../lib/errors.js';

export const VERIFY_EMAIL_PATH = '/verify-email';
export const RESET_PASSWORD_PATH = '/reset-password';
export const REQUEST_VERIFY_PATH = '/verify-request';
export const TRACK_PATH = '/track';

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

interface RequestedGood {
  name: string;
  quantity: number;
}

function fieldGoods(data: unknown, key: string): RequestedGood[] {
  if (!isRecord(data)) throw internal('Email template data is malformed.');
  const value: unknown = data[key];
  if (!Array.isArray(value)) throw internal('Email template data is malformed.');
  return value.map((entry: unknown): RequestedGood => {
    if (!isRecord(entry)) throw internal('Email template data is malformed.');
    const name: unknown = entry.name;
    const quantity: unknown = entry.quantity;
    if (typeof name !== 'string' || name.length === 0) {
      throw internal('Email template data is malformed.');
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      throw internal('Email template data is malformed.');
    }
    return { name, quantity };
  });
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

function shell(body: string): string {
  const year = new Date().getUTCFullYear();
  return (
    `<div style="background:#F8FAFC;margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#183327;">` +
    `<div style="max-width:560px;margin:0 auto;">` +
    `<div style="text-align:center;padding:12px 0 20px;">` +
    `<div style="font-size:26px;font-weight:bold;letter-spacing:4px;color:#4C7273;">AGAPAY</div>` +
    `<div style="font-size:13px;color:#625F5F;margin-top:4px;">Relief Today. Stronger Tomorrow.</div>` +
    `</div>` +
    `<div style="background:#FFFFFF;border:1px solid #BAC9C9;border-radius:12px;padding:28px 26px;">` +
    body +
    `</div>` +
    `<div style="text-align:center;font-size:12px;color:#625F5F;padding:18px 0 6px;">` +
    `Helping communities recover, one relief effort at a time.<br>&copy; ${year} Agapay` +
    `</div>` +
    `</div></div>`
  );
}

function greeting(name: string): string {
  return `<p style="font-size:15px;font-weight:bold;margin:0 0 12px;">Hello, ${escapeHtml(name)},</p>`;
}

function paragraph(text: string): string {
  return `<p style="font-size:14px;line-height:1.6;margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function sectionLabel(text: string): string {
  return `<p style="font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;margin:20px 0 8px;">${escapeHtml(text)}</p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #BAC9C9;margin:20px 0;">`;
}

function detailRow(label: string, value: string): string {
  return `<p style="font-size:14px;line-height:1.6;margin:0 0 4px;">${escapeHtml(label)}: ${escapeHtml(value)}</p>`;
}

function actionButton(text: string, href: string): string {
  return (
    `<p style="margin:18px 0 6px;">` +
    `<a href="${escapeHtml(href)}" style="display:block;background:#4C7273;color:#FFFFFF;text-align:center;padding:14px 16px;border-radius:8px;font-size:15px;font-weight:bold;text-decoration:none;">${escapeHtml(text)}</a>` +
    `</p>`
  );
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
        html: shell(
          greeting(name) +
            paragraph(
              'Thanks for registering with Agapay. Please confirm your email address within 24 hours:',
            ) +
            actionButton('Confirm my email address', link) +
            paragraph('If you did not register, you can ignore this email.'),
        ),
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
        html: shell(
          greeting(name) +
            paragraph('We received a password reset request for your Agapay account:') +
            actionButton('Reset my password', link) +
            paragraph('If you did not ask for this, you can ignore this email.'),
        ),
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
        html: shell(
          greeting(name) +
            paragraph(
              `Your donation ${referenceNumber} will be collected on ${manilaDateTime(startAt)} at ${location}.`,
            ) +
            paragraph(
              'Please have the goods packed and ready. Reply to this email if the schedule does not work for you.',
            ),
        ),
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
        html: shell(
          greeting(name) +
            paragraph(
              `Your goods are ready. Please come on ${manilaDateTime(startAt)} at ${location}.`,
            ) +
            paragraph('Bring your tracking number and a valid ID.'),
        ),
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
        html: shell(
          greeting(name) +
            paragraph(
              `Your goods for tracking number ${trackingNumber} were released. Thank you, and take care.`,
            ),
        ),
        text: `Hi ${name},\n\nYour goods for tracking number ${trackingNumber} were released. Thank you, and take care.`,
      };
    }
    case 'DISTRIBUTION_CANCELLED': {
      const name = field(templateData, 'name');
      const location = field(templateData, 'location');
      const startAt = field(templateData, 'startAt');
      return {
        subject: 'Your distribution schedule was cancelled',
        html: shell(
          greeting(name) +
            paragraph(
              `The distribution scheduled on ${manilaDateTime(startAt)} at ${location} was cancelled. We will email you a new schedule soon.`,
            ),
        ),
        text:
          `Hi ${name},\n\nThe distribution scheduled on ` +
          `${manilaDateTime(startAt)} at ${location} was cancelled. We will email you a new schedule soon.`,
      };
    }
    case 'COLLECTION_REMINDER':
    case 'DISTRIBUTION_REMINDER': {
      const name = field(templateData, 'name');
      const location = field(templateData, 'location');
      const startAt = field(templateData, 'startAt');
      const text = `Hi ${name}, your Agapay schedule is ${manilaDateTime(startAt)} at ${location}.`;
      return { subject: 'Your Agapay schedule reminder', text, html: shell(paragraph(text)) };
    }
    case 'DONATION_SUBMITTED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      return {
        subject: 'We received your donation',
        html: shell(
          greeting(name) +
            paragraph(
              `Thanks for supporting relief efforts. Your donation ${referenceNumber} is awaiting verification. We will email you once our team reviews it.`,
            ),
        ),
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
        html: shell(
          greeting(name) +
            paragraph(
              `Good news: your donation ${referenceNumber} passed verification. We will email you again when collection is scheduled.`,
            ),
        ),
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
        html: shell(
          greeting(name) +
            paragraph(
              `Thanks for offering to help. We could not accept your donation ${referenceNumber} this time:`,
            ) +
            paragraph(reason) +
            paragraph('You are welcome to submit a new donation at any time.'),
        ),
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
        html: shell(
          greeting(name) +
            paragraph(
              `We received your assistance request ${referenceNumber}. Our team will review it and email you the outcome.`,
            ),
        ),
        text:
          `Hi ${name},\n\nWe received your assistance request ${referenceNumber}. ` +
          `Our team will review it and email you the outcome.`,
      };
    }
    case 'REQUEST_VERIFY_EMAIL': {
      const name = field(templateData, 'name');
      const token = field(templateData, 'token');
      const link = `${webOrigin}${REQUEST_VERIFY_PATH}?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Confirm your email for your assistance request',
        html: shell(
          greeting(name) +
            paragraph('Please confirm your email address so we can reach you about your request:') +
            actionButton('Confirm my email address', link) +
            paragraph('If you did not submit a request, you can ignore this email.'),
        ),
        text:
          `Hi ${name},\n\nPlease confirm your email address so we can reach you about your request:\n` +
          `${link}\n\n` +
          `If you did not submit a request, you can ignore this email.`,
      };
    }
    case 'REQUEST_APPROVED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      const trackingNumber = field(templateData, 'trackingNumber');
      const campaignName = field(templateData, 'campaignName');
      const goods = fieldGoods(templateData, 'items');
      const assistance = goods.map((item) => `${item.name} x${item.quantity}`).join(' | ');
      return {
        subject: 'Your assistance request was approved',
        html: shell(
          greeting(name) +
            paragraph(
              'Good news! Your request for relief assistance has been reviewed and approved by the Agapay team.',
            ) +
            sectionLabel('Your tracking number') +
            `<p style="font-size:26px;font-weight:bold;text-align:center;letter-spacing:2px;margin:0 0 12px;">${escapeHtml(trackingNumber)}</p>` +
            paragraph('Use this tracking number to check the status of your assistance request.') +
            actionButton('Track My Request', `${webOrigin}${TRACK_PATH}`) +
            sectionLabel('Request details') +
            divider() +
            detailRow('Campaign', campaignName) +
            detailRow('Reference Number', referenceNumber) +
            detailRow('Requested Assistance', assistance) +
            detailRow('Status', 'Approved') +
            divider() +
            paragraph(
              'You can use your tracking number anytime to view updates about your request, including the distribution schedule. Please keep this tracking number for future reference. Need help? Reply to this email or contact the Agapay support team. Thank you, The Agapay Team',
            ),
        ),
        text:
          `Hi ${name},\n\nGood news! Your request for relief assistance has been reviewed and approved by the Agapay team.\n\n` +
          `YOUR TRACKING NUMBER:\n${trackingNumber}\n\n` +
          `Use this tracking number to check the status of your assistance request: ${webOrigin}${TRACK_PATH}\n\n` +
          `REQUEST DETAILS\nCampaign: ${campaignName}\nReference Number: ${referenceNumber}\nRequested Assistance: ${assistance}\nStatus: Approved\n\n` +
          `You can use your tracking number anytime to view updates about your request, including the distribution schedule. ` +
          `Please keep this tracking number for future reference. Need help? Reply to this email or contact the Agapay support team.\nThank you,\nThe Agapay Team`,
      };
    }
    case 'REQUEST_REJECTED': {
      const name = field(templateData, 'name');
      const referenceNumber = field(templateData, 'referenceNumber');
      const reason = field(templateData, 'reason');
      return {
        subject: 'Update on your assistance request',
        html: shell(
          greeting(name) +
            paragraph(
              `Thanks for reaching out. We could not approve your request ${referenceNumber} this time:`,
            ) +
            paragraph(reason) +
            paragraph('If you think this is a mistake, please contact our team.'),
        ),
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
