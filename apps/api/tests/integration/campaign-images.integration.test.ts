import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  UserRole,
  accessTokenResponseSchema,
  errorEnvelopeSchema,
  campaignResponseSchema,
  publicCampaignListResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

// Upload resolution is per request, so pointing UPLOAD_DIR at a temp directory
// here keeps test files out of the real upload folder.
const UPLOAD_TMP = mkdtempSync(path.join(tmpdir(), 'agapay-campaign-uploads-'));
process.env.UPLOAD_DIR = UPLOAD_TMP;

const app = createApp();
const PASSWORD = 'campaign image secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff0300000600050b1727d60000000049454e44ae426082',
  'hex',
);

let seq = 0;
let ipSeq = 0;
const uniqueIp = (): string => `198.51.103.${((ipSeq += 1) % 250) + 1}`;

function parse<T>(res: request.Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) throw new Error('unexpected response body');
  return parsed.data;
}

const errorCode = (res: request.Response): string => parse(res, errorEnvelopeSchema).error.code;

let admin = '';
let campaignId = '';

const upload = (
  url: string,
  token: string | null,
  file: Buffer,
  filename: string,
  contentType: string,
): request.Test => {
  const req = request(app).post(url).set('X-Forwarded-For', uniqueIp());
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.attach('image', file, { filename, contentType });
};

describe('campaign cover image upload', () => {
  beforeAll(async () => {
    const email = `camp-${RUN}-${seq++}@example.com`;
    await prisma.user.create({
      data: {
        name: 'Campaign Admin',
        email,
        passwordHash: await hashPassword(PASSWORD),
        role: UserRole.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email, password: PASSWORD });
    admin = parse(login, accessTokenResponseSchema).data.accessToken;

    const created = await request(app)
      .post('/api/v1/campaigns')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${admin}`)
      .send({
        name: `Image Campaign ${RUN}`,
        description: 'Cover image fixture',
        calamityType: 'TYPHOON',
        startDate: new Date().toISOString(),
      });
    expect(created.status).toBe(201);
    campaignId = parse(created, campaignResponseSchema).data.id;
  });

  afterAll(() => {
    rmSync(UPLOAD_TMP, { recursive: true, force: true });
  });

  it('exposes existing covers through paginated public campaign search', async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'ACTIVE', coverImageUrl: '/uploads/campaigns/public-fixture.png' },
    });
    try {
      const res = await request(app)
        .get(`/api/v1/public/campaigns?q=${encodeURIComponent(RUN)}&pageSize=1`)
        .set('X-Forwarded-For', uniqueIp());
      expect(res.status).toBe(200);
      const result = parse(res, publicCampaignListResponseSchema).data;
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe(campaignId);
      expect(result.items[0]?.coverImageUrl).toBe('/uploads/campaigns/public-fixture.png');
    } finally {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'DRAFT', coverImageUrl: null },
      });
    }
  });

  it('stores an admin PNG and serves it back', async () => {
    const res = await upload(
      `/api/v1/campaigns/${campaignId}/image`,
      admin,
      PNG,
      'cover.png',
      'image/png',
    );
    expect(res.status).toBe(200);
    const item = parse(res, campaignResponseSchema).data;
    expect(item.coverImageUrl).toMatch(/^\/uploads\/campaigns\/[0-9a-f-]+\.png$/);

    const served =
      item.coverImageUrl === null
        ? null
        : await request(app).get(item.coverImageUrl).set('X-Forwarded-For', uniqueIp());
    expect(served?.status).toBe(200);
    expect(served?.headers['content-type']).toContain('image/png');
    expect(served?.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('replaces the image and removes the old file', async () => {
    const first = await upload(
      `/api/v1/campaigns/${campaignId}/image`,
      admin,
      PNG,
      'a.png',
      'image/png',
    );
    const firstUrl = parse(first, campaignResponseSchema).data.coverImageUrl;
    const second = await upload(
      `/api/v1/campaigns/${campaignId}/image`,
      admin,
      PNG,
      'b.png',
      'image/png',
    );
    const secondUrl = parse(second, campaignResponseSchema).data.coverImageUrl;
    expect(secondUrl).not.toBe(firstUrl);
    if (firstUrl !== null) {
      expect(existsSync(path.join(UPLOAD_TMP, 'campaigns', path.basename(firstUrl)))).toBe(false);
    }
  });

  it('rejects oversize images and non-image files with 422', async () => {
    const big = await upload(
      `/api/v1/campaigns/${campaignId}/image`,
      admin,
      Buffer.alloc(6 * 1024 * 1024, 0),
      'big.png',
      'image/png',
    );
    expect(big.status).toBe(422);
    expect(errorCode(big)).toBe('BUSINESS_RULE_VIOLATION');

    const text = await upload(
      `/api/v1/campaigns/${campaignId}/image`,
      admin,
      Buffer.from('not an image'),
      'notes.txt',
      'text/plain',
    );
    expect(text.status).toBe(422);
    expect(errorCode(text)).toBe('BUSINESS_RULE_VIOLATION');
  });
});
