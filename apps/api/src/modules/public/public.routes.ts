import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { CampaignStatus, ErrorCode, ERROR_STATUS } from '@agapay/shared';
import {
  publicCampaignListQuerySchema,
  publicItemTypeListQuerySchema,
  submitRequestSchema,
  trackRequestSchema,
  verifyRequestEmailSchema,
  type PublicCampaignDto,
} from '@agapay/shared';
import type { CampaignDto } from '@agapay/shared';
import { getRequestId } from '../../lib/http/request-context.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { notFound, validationError } from '../../lib/errors.js';
import { hashIp, hashToken } from '../auth/password.js';
import { list as listCampaigns, getBySlug } from '../campaigns/campaigns.service.js';
import { list as listItemTypes } from '../item-types/item-types.service.js';
import * as service from '../requests/requests.service.js';
import { verifyTurnstileToken } from './turnstile.js';
import { stats } from './public.service.js';

export const publicRouter = Router();

const limiterHandler = (_req: Request, res: Response): void => {
  res.setHeader('Retry-After', '900');
  res.status(ERROR_STATUS.RATE_LIMITED).json({
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please try again later.',
      requestId: getRequestId() ?? 'unknown',
    },
  });
};

const submitPerIp = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limiterHandler,
});

const submitPerEmail = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limiterHandler,
  keyGenerator: (req: Request): string => {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) return 'no-email';
    const email = (body as { email?: unknown }).email;
    return typeof email === 'string' ? hashToken(email.toLowerCase()) : 'no-email';
  },
});

const trackPerIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limiterHandler,
});

const trackPerCode = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: limiterHandler,
  keyGenerator: (req: Request): string => {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) return 'no-code';
    const code = (body as { code?: unknown }).code;
    return typeof code === 'string' ? hashToken(code.trim().toUpperCase()) : 'no-code';
  },
});

function toPublicCampaign(row: CampaignDto): PublicCampaignDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    calamityType: row.calamityType,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    areas: row.areas.map((area) => ({
      barangay: area.barangay,
      city: area.city,
      province: area.province,
    })),
    priorityItems: row.priorityItems,
  };
}

publicRouter.get('/campaigns', async (req, res) => {
  const raw: unknown = req.query;
  const parsed = publicCampaignListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await listCampaigns({
    status: CampaignStatus.ACTIVE,
    calamityType: parsed.data.calamityType,
    q: undefined,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
  res.status(200).json({
    data: {
      items: result.items.map(toPublicCampaign),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  });
});

publicRouter.get('/campaigns/:slug', async (req, res) => {
  const row = await getBySlug(pathParam(req, 'slug'));
  if (row.status !== CampaignStatus.ACTIVE) throw notFound('Campaign');
  res.status(200).json({ data: toPublicCampaign(row) });
});

publicRouter.get('/item-types', async (req, res) => {
  const raw: unknown = req.query;
  const parsed = publicItemTypeListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await listItemTypes({
    isActive: true,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
  res.status(200).json({
    data: {
      items: result.items.map((row) => ({
        id: row.id,
        name: row.name,
        unit: row.unit,
        category: row.category,
        maxPerRequest: row.maxPerRequest,
        perHouseholdMember: row.perHouseholdMember,
      })),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  });
});

publicRouter.get('/stats', async (_req, res) => {
  res.status(200).json({ data: await stats(systemClock.now()) });
});

publicRouter.post('/assistance-requests', submitPerIp, submitPerEmail, async (req, res) => {
  const body: unknown = req.body;
  const parsed = submitRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const human = await verifyTurnstileToken(parsed.data.turnstileToken, req.ip);
  if (!human) {
    throw validationError({ turnstileToken: 'Bot verification failed. Please try again.' });
  }

  const result = await service.submitPublic(parsed.data, hashIp(req.ip), systemClock);
  res.status(201).json({ data: result });
});

publicRouter.post('/assistance-requests/verify-email', async (req, res) => {
  const body: unknown = req.body;
  const parsed = verifyRequestEmailSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.verifyRequestEmail(parsed.data.token, systemClock) });
});

publicRouter.post('/track', trackPerIp, trackPerCode, async (req, res) => {
  const body: unknown = req.body;
  const parsed = trackRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const found = await service.track(parsed.data);
  res.status(200).json({
    data: {
      code: found.code,
      campaign: { name: found.campaignName },
      status: found.status,
      statusMessage: found.statusMessage,
      submittedAt: found.submittedAt,
      timeline: found.timeline,
      distribution: found.distribution,
      rejectionReason: found.rejectionReason,
    },
  });
});
