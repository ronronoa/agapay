import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  accessTokenResponseSchema,
  reportResponseSchema,
  reportCsv,
  type ReportKind,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

const app = createApp();
const run = `${process.pid}-${Date.now()}`;
let campaignId = '';
let foodId = '';
let stockId = '';
let seq = 0;
const tokens = { ADMIN: '', STAFF: '', DONOR: '' };
const kinds: ReportKind[] = ['donations', 'requests', 'inventory', 'distributions'];
const start = new Date('2026-10-31T16:00:00Z');
const end = new Date('2026-11-30T16:00:00Z');
const privateName = 'PRIVATE_REPORT_RECIPIENT';
const privateEmail = `private-${run}@example.com`;
const filters = () => ({ from: '2026-11-01', to: '2026-11-30', campaignId });
function read(kind: ReportKind, token = tokens.ADMIN) {
  return request(app)
    .get(`/api/v1/reports/${kind}`)
    .set('Authorization', `Bearer ${token}`)
    .query(filters());
}

beforeAll(async () => {
  let donorId = '';
  const password = 'reports integration secret';
  const passwordHash = await hashPassword(password);
  for (const role of ['ADMIN', 'STAFF', 'DONOR'] as const) {
    const email = `reports-${role.toLowerCase()}-${run}@example.com`;
    const user = await prisma.user.create({
      data: { name: 'Reports Actor', role, email, passwordHash },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `198.51.105.${++seq}`)
      .send({ email, password });
    tokens[role] = accessTokenResponseSchema.parse(login.body).data.accessToken;
    if (role === 'DONOR') donorId = user.id;
  }
  const campaign = await prisma.campaign.create({
    data: {
      name: '=SUM(1,2)',
      slug: `reports-${run}`,
      description: 'Reports fixture',
      calamityType: 'FLOOD',
      status: 'ACTIVE',
      startDate: start,
    },
  });
  campaignId = campaign.id;
  const other = await prisma.campaign.create({
    data: {
      name: 'Other campaign',
      slug: `reports-other-${run}`,
      description: 'Reports fixture',
      calamityType: 'FLOOD',
      status: 'ACTIVE',
      startDate: start,
    },
  });
  const food = await prisma.itemType.create({
    data: { name: `Reports Food ${run}`, category: 'FOOD', unit: 'pack', lowStockThreshold: 5 },
  });
  foodId = food.id;
  const water = await prisma.itemType.create({
    data: { name: `Reports Water ${run}`, category: 'WATER', unit: 'bottle', lowStockThreshold: 5 },
  });
  const foodStock = await prisma.inventoryItem.create({
    data: { campaignId, itemTypeId: food.id, available: 10, reserved: 3, distributed: 4 },
  });
  stockId = foodStock.id;
  const waterStock = await prisma.inventoryItem.create({
    data: { campaignId, itemTypeId: water.id, available: 0, distributed: 2 },
  });
  await prisma.inventoryItem.create({
    data: { campaignId: other.id, itemTypeId: food.id, available: 999 },
  });
  const donationIds = Array.from({ length: 121 }, () => randomUUID());
  await prisma.donation.createMany({
    data: donationIds.map((id, index) => ({
      id,
      referenceNumber: `DON-REPORT-${run}-${index}`,
      donorId,
      campaignId,
      status: 'COMPLETED' as const,
      submittedAt: start,
    })),
  });
  await prisma.donationItem.createMany({
    data: donationIds.map((donationId) => ({
      donationId,
      itemTypeId: food.id,
      quantityDeclared: 5,
      quantityReceived: 3,
    })),
  });
  for (const [index, submittedAt] of [new Date(start.getTime() - 1), end].entries())
    await prisma.donation.create({
      data: { referenceNumber: `DON-REPORT-OUT-${run}-${index}`, donorId, campaignId, submittedAt },
    });
  await prisma.donation.create({
    data: {
      referenceNumber: `DON-REPORT-OTHER-${run}`,
      donorId,
      campaignId: other.id,
      submittedAt: start,
    },
  });
  for (const [index, type] of [
    'DONATION_IN',
    'RESERVE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
  ].entries()) {
    const movementType =
      index === 0
        ? 'DONATION_IN'
        : index === 1
          ? 'RESERVE'
          : index === 2
            ? 'ADJUSTMENT_IN'
            : 'ADJUSTMENT_OUT';
    await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: foodStock.id,
        type: movementType,
        quantity: index === 0 ? 10 : 3,
        availableAfter: 10,
        reservedAfter: 3,
        distributedAfter: 4,
        reason: type,
        createdAt: index < 2 ? start : index === 2 ? new Date(start.getTime() - 1) : end,
      },
    });
  }
  const makeRequest = (
    index: number,
    submittedAt: Date,
    status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISTRIBUTED',
    reviewedAt: Date | null = null,
  ) =>
    prisma.assistanceRequest.create({
      data: {
        referenceNumber: `REQ-REPORT-${run}-${index}`,
        fullName: privateName,
        email: index === 0 ? privateEmail : `private-${run}-${index}@example.com`,
        contactNumber: '09171234567',
        barangay: 'San Isidro',
        city: index === 1 ? 'Beta' : 'Alpha',
        province: 'Test Province',
        campaignId,
        status,
        consentAt: start,
        submittedAt,
        reviewedAt,
        ...(status === 'REJECTED' ? { rejectionReason: 'Fixture rejection' } : {}),
      },
    });
  const approved = await makeRequest(0, start, 'APPROVED', new Date(start.getTime() + 2 * 3600000));
  await makeRequest(1, start, 'PENDING');
  await makeRequest(2, start, 'REJECTED', new Date(start.getTime() + 4 * 3600000));
  const received = await makeRequest(3, new Date('2020-01-01'), 'DISTRIBUTED');
  const event = await prisma.calendarEvent.create({
    data: {
      campaignId,
      type: 'DISTRIBUTION',
      title: 'Report distribution',
      location: 'Test hall',
      startAt: start,
      endAt: new Date(start.getTime() + 86400000),
    },
  });
  await prisma.distribution.create({
    data: {
      requestId: received.id,
      calendarEventId: event.id,
      status: 'DISTRIBUTED',
      distributedAt: start,
      receivedByName: privateName,
      notes: 'PRIVATE_NOTES',
      items: {
        create: [
          { inventoryItemId: foodStock.id, quantity: 4 },
          { inventoryItemId: waterStock.id, quantity: 2 },
        ],
      },
    },
  });
  for (const status of ['SCHEDULED', 'CANCELLED'] as const)
    await prisma.distribution.create({
      data: {
        requestId: approved.id,
        calendarEventId: event.id,
        status,
        items: { create: [{ inventoryItemId: foodStock.id, quantity: 99 }] },
      },
    });
});

describe('M5B reports', () => {
  it('enforces admin/staff permissions on every JSON and CSV endpoint', async () => {
    for (const kind of kinds) {
      expect((await request(app).get(`/api/v1/reports/${kind}`)).status).toBe(401);
      expect((await read(kind, tokens.DONOR)).status).toBe(403);
      expect((await read(kind, tokens.STAFF)).status).toBe(200);
      expect(
        (
          await request(app)
            .get(`/api/v1/reports/${kind}`)
            .set('Authorization', `Bearer ${tokens.STAFF}`)
            .query({ ...filters(), format: 'csv' })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .get(`/api/v1/reports/${kind}`)
            .set('Authorization', `Bearer ${tokens.DONOR}`)
            .query({ ...filters(), format: 'csv' })
        ).status,
      ).toBe(403);
    }
  });
  it('includes all 121 donations, respects campaign and Manila dates, and separates actual quantities', async () => {
    const response = await read('donations');
    expect(response.status).toBe(200);
    const report = reportResponseSchema.parse(response.body).data;
    if (report.kind !== 'donations') throw new Error('Unexpected report');
    expect(report.total).toBe(121);
    expect(report.byStatus).toEqual([{ status: 'COMPLETED', count: 121 }]);
    expect(report.byMonth).toEqual([{ month: '2026-11', count: 121 }]);
    expect(report.byCampaign).toEqual([{ campaignId, campaignName: '=SUM(1,2)', count: 121 }]);
    expect(report.byItem).toEqual([
      {
        itemTypeId: foodId,
        itemTypeName: `Reports Food ${run}`,
        unit: 'pack',
        declared: 605,
        received: 363,
      },
    ]);
  });
  it('groups full barangay locations and averages reviewed records only', async () => {
    const report = reportResponseSchema.parse((await read('requests')).body).data;
    if (report.kind !== 'requests') throw new Error('Unexpected report');
    expect(report.total).toBe(3);
    expect(report.averageReviewHours).toBe(3);
    expect(report.byBarangay).toEqual([
      { barangay: 'San Isidro', city: 'Alpha', province: 'Test Province', count: 2 },
      { barangay: 'San Isidro', city: 'Beta', province: 'Test Province', count: 1 },
    ]);
  });
  it('shows current inventory separately from dated movement aggregates', async () => {
    const report = reportResponseSchema.parse((await read('inventory')).body).data;
    if (report.kind !== 'inventory') throw new Error('Unexpected report');
    expect(report.total).toBe(2);
    expect(report.lowStockRows).toBe(1);
    expect(report.stock.find((row) => row.unit === 'pack')).toMatchObject({
      available: 10,
      reserved: 3,
      distributed: 4,
    });
    expect(report.movements.map((row) => ({ type: row.type, quantity: row.quantity }))).toEqual([
      { type: 'DONATION_IN', quantity: 10 },
      { type: 'RESERVE', quantity: 3 },
    ]);
    const emptyPeriod = await request(app)
      .get('/api/v1/reports/inventory')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
      .query({ campaignId, from: '2000-01-01', to: '2000-01-01' });
    const unchanged = reportResponseSchema.parse(emptyPeriod.body).data;
    if (unchanged.kind !== 'inventory') throw new Error('Unexpected report');
    expect(unchanged.stock).toEqual(report.stock);
    expect(unchanged.movements).toEqual([]);
  });
  it('dates distributions by handover, counts a handover once across items, and excludes reservations/cancellations', async () => {
    const report = reportResponseSchema.parse((await read('distributions')).body).data;
    if (report.kind !== 'distributions') throw new Error('Unexpected report');
    expect(report.total).toBe(1);
    expect(report.units).toBe(6);
    expect(report.byBarangay).toEqual([
      {
        barangay: 'San Isidro',
        city: 'Alpha',
        province: 'Test Province',
        handovers: 1,
        quantity: 6,
      },
    ]);
    expect(report.byItem.map((row) => row.quantity)).toEqual([4, 2]);
  });
  it('returns empty aggregates and rejects malformed filters', async () => {
    for (const kind of kinds) {
      const response = await request(app)
        .get(`/api/v1/reports/${kind}`)
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .query({ campaignId: randomUUID() });
      expect(response.status).toBe(200);
      expect(reportResponseSchema.parse(response.body).data.total).toBe(0);
    }
    for (const query of [
      { from: '2026-02-30' },
      { from: '2026-11-02', to: '2026-11-01' },
      { campaignId: 'bad' },
      { format: 'pdf' },
      { q: 'private' },
    ]) {
      expect(
        (
          await request(app)
            .get('/api/v1/reports/donations')
            .set('Authorization', `Bearer ${tokens.ADMIN}`)
            .query(query)
        ).status,
      ).toBe(400);
    }
  });
  it('exports the same aggregates, protects formulas, and excludes recipient data', async () => {
    for (const kind of kinds) {
      const json = await read(kind);
      const report = reportResponseSchema.parse(json.body).data;
      const csv = await request(app)
        .get(`/api/v1/reports/${kind}`)
        .set('Authorization', `Bearer ${tokens.ADMIN}`)
        .query({ ...filters(), format: 'csv' });
      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['cache-control']).toBe('no-store');
      expect(csv.headers['content-disposition']).toContain(`agapay-${kind}-`);
      const withoutTime = (text: string) =>
        text
          .split('\r\n')
          .filter((line) => !line.startsWith('"Filters","Snapshot (UTC)"'))
          .join('\r\n');
      expect(withoutTime(csv.text)).toBe(withoutTime(reportCsv(report)));
      expect(csv.text).toContain('"\'=SUM(1,2)"');
      for (const value of [
        privateName,
        privateEmail,
        'PRIVATE_NOTES',
        'receivedByName',
        'contactNumber',
      ]) {
        expect(csv.text).not.toContain(value);
        expect(JSON.stringify(json.body)).not.toContain(value);
      }
    }
  });
  it('exports inventory aggregate groups beyond 100 rows', async () => {
    const ids = Array.from({ length: 121 }, () => randomUUID());
    await prisma.itemType.createMany({
      data: ids.map((id, index) => ({
        id,
        name: `Reports Extra ${run}-${String(index).padStart(3, '0')}`,
        category: 'FOOD' as const,
        unit: 'pack',
      })),
    });
    await prisma.inventoryItem.createMany({
      data: ids.map((itemTypeId) => ({ itemTypeId, campaignId, available: 1 })),
    });
    const report = reportResponseSchema.parse((await read('inventory')).body).data;
    if (report.kind !== 'inventory') throw new Error('Unexpected report');
    expect(report.total).toBe(123);
    expect(report.stock).toHaveLength(123);
    expect(reportCsv(report)).toContain(`Reports Extra ${run}-120`);
    expect(await prisma.inventoryItem.findUnique({ where: { id: stockId } })).not.toBeNull();
  });
});
