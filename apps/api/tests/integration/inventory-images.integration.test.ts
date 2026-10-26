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
  inventoryResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

// Upload resolution is per request (not at import), so pointing UPLOAD_DIR at
// a temp directory here keeps test files out of the real upload folder.
const UPLOAD_TMP = mkdtempSync(path.join(tmpdir(), 'agapay-uploads-'));
process.env.UPLOAD_DIR = UPLOAD_TMP;

const app = createApp();
const PASSWORD = 'upload integration secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

// A real 1x1 PNG: the server validates MIME type, not just the extension.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff0300000600050b1727d60000000049454e44ae426082',
  'hex',
);

let seq = 0;
let ipSeq = 0;
const uniqueIp = (): string => `198.51.102.${((ipSeq += 1) % 250) + 1}`;

function parse<T>(res: request.Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) throw new Error('unexpected response body');
  return parsed.data;
}

const errorCode = (res: request.Response): string => parse(res, errorEnvelopeSchema).error.code;

interface Actor {
  token: string;
}

async function makeUser(role: UserRole): Promise<Actor> {
  const email = `img-${RUN}-${seq++}@example.com`;
  await prisma.user.create({
    data: {
      name: 'Image Actor',
      email,
      passwordHash: await hashPassword(PASSWORD),
      role,
      emailVerifiedAt: new Date(),
    },
  });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', uniqueIp())
    .send({ email, password: PASSWORD });
  return { token: parse(res, accessTokenResponseSchema).data.accessToken };
}

let staff = '';
let donor = '';
let campaignId = '';
let itemTypeId = '';
let rowId = '';

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

describe('inventory photo upload', () => {
  beforeAll(async () => {
    staff = (await makeUser(UserRole.STAFF)).token;
    donor = (await makeUser(UserRole.DONOR)).token;
    const campaign = await prisma.campaign.create({
      data: {
        name: `Img Relief ${RUN}`,
        slug: `img-relief-${RUN}`,
        description: 'Image fixture campaign',
        calamityType: 'TYPHOON',
        status: 'ACTIVE',
        startDate: new Date(),
      },
      select: { id: true },
    });
    campaignId = campaign.id;
    const itemType = await prisma.itemType.create({
      data: { name: `Img Rice ${RUN}`, category: 'FOOD', unit: 'pack' },
      select: { id: true },
    });
    itemTypeId = itemType.id;
    const adjusted = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staff}`)
      .send({ itemTypeId, campaignId, direction: 'IN', quantity: 10, reason: 'Fixture supply' });
    expect(adjusted.status).toBe(200);
    rowId = parse(adjusted, inventoryResponseSchema).data.id;
  });

  afterAll(() => {
    rmSync(UPLOAD_TMP, { recursive: true, force: true });
  });

  it('stores a staff PNG and serves it back', async () => {
    const res = await upload(
      `/api/v1/inventory/${rowId}/image`,
      staff,
      PNG,
      'rice.png',
      'image/png',
    );
    expect(res.status).toBe(200);
    const item = parse(res, inventoryResponseSchema).data;
    expect(item.imageUrl).toMatch(/^\/uploads\/inventory\/[0-9a-f-]+\.png$/);

    const stored = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: rowId },
      select: { imageUrl: true },
    });
    expect(stored.imageUrl).toBe(item.imageUrl);

    const served =
      item.imageUrl === null
        ? null
        : await request(app).get(item.imageUrl).set('X-Forwarded-For', uniqueIp());
    expect(served?.status).toBe(200);
    expect(served?.headers['content-type']).toContain('image/png');
    expect(served?.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('replaces the photo and removes the old file', async () => {
    const first = await upload(
      `/api/v1/inventory/${rowId}/image`,
      staff,
      PNG,
      'a.png',
      'image/png',
    );
    const firstUrl = parse(first, inventoryResponseSchema).data.imageUrl;
    expect(firstUrl).not.toBeNull();

    const second = await upload(
      `/api/v1/inventory/${rowId}/image`,
      staff,
      PNG,
      'b.png',
      'image/png',
    );
    const secondUrl = parse(second, inventoryResponseSchema).data.imageUrl;
    expect(secondUrl).not.toBe(firstUrl);

    if (firstUrl !== null) {
      expect(existsSync(path.join(UPLOAD_TMP, 'inventory', path.basename(firstUrl)))).toBe(false);
    }
  });

  it('rejects oversize photos with 422', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 0);
    const res = await upload(
      `/api/v1/inventory/${rowId}/image`,
      staff,
      big,
      'big.png',
      'image/png',
    );
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('rejects non-image files with 422', async () => {
    const res = await upload(
      `/api/v1/inventory/${rowId}/image`,
      staff,
      Buffer.from('not a photo'),
      'notes.txt',
      'text/plain',
    );
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('refuses donors with 403 and strangers with 401', async () => {
    const denied = await upload(
      `/api/v1/inventory/${rowId}/image`,
      donor,
      PNG,
      'rice.png',
      'image/png',
    );
    expect(denied.status).toBe(403);

    const anonymous = await upload(
      `/api/v1/inventory/${rowId}/image`,
      null,
      PNG,
      'rice.png',
      'image/png',
    );
    expect(anonymous.status).toBe(401);
  });
});
