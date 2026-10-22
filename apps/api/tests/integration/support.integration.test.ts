import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  accessTokenResponseSchema,
  supportConversationResponseSchema,
  supportMessagesResponseSchema,
  supportSendResponseSchema,
  supportListResponseSchema,
  inboxResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { FixedClock } from '../../src/lib/clock.js';
import * as support from '../../src/modules/support/support.service.js';
import {
  isSupportEmailCurrent,
  scanOperationalNotifications,
} from '../../src/modules/support/inbox.service.js';
import { dispatchLive } from '../../src/modules/support/realtime.js';
import { renderEmail } from '../../src/modules/notifications/templates/render.js';
import { env } from '../../src/lib/env.js';

const app = createApp();
const run = `${process.pid}-${Date.now()}`;
const people = {
  donor: { id: '', token: '', role: 'DONOR' as const },
  other: { id: '', token: '', role: 'DONOR' as const },
  staff: { id: '', token: '', role: 'STAFF' as const },
  admin: { id: '', token: '', role: 'ADMIN' as const },
};
let conversationId = '';
const actor = (key: keyof typeof people) => ({ userId: people[key].id, role: people[key].role });
const auth = (key: keyof typeof people) => `Bearer ${people[key].token}`;
const send = (
  key: keyof typeof people,
  body = 'PRIVATE_SUPPORT_BODY',
  clientMessageId = randomUUID(),
) =>
  request(app)
    .post(`/api/v1/support/conversations/${conversationId}/messages`)
    .set('Authorization', auth(key))
    .send({ body, clientMessageId });
beforeAll(async () => {
  const password = 'support integration secret';
  const passwordHash = await hashPassword(password);
  for (const [index, [key, person]] of Object.entries(people).entries()) {
    const email = `support-${key}-${run}@example.invalid`;
    const user = await prisma.user.create({
      data: { name: `Support ${key} ${run}`, email, role: person.role, passwordHash },
    });
    person.id = user.id;
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `198.19.1.${index + 1}`)
      .send({ email, password });
    person.token = accessTokenResponseSchema.parse(login.body).data.accessToken;
  }
  const res = await request(app)
    .post('/api/v1/support/conversations')
    .set('Authorization', auth('donor'));
  conversationId = supportConversationResponseSchema.parse(res.body).data.id;
});
afterAll(async () => {
  await prisma.liveEvent.deleteMany({
    where: { OR: [{ conversationId }, { userId: { in: Object.values(people).map((p) => p.id) } }] },
  });
  await prisma.emailNotification.deleteMany({
    where: {
      type: 'SUPPORT_UNREAD',
      templateData: { path: ['support', 'conversationId'], equals: conversationId },
    },
  });
  await prisma.user.updateMany({
    where: { id: { in: Object.values(people).map((p) => p.id) } },
    data: { isActive: false },
  });
});
describe('M5F donor support and inbox', () => {
  it('enforces private ownership, personnel access, strict inputs and one donor conversation', async () => {
    expect((await request(app).get('/api/v1/support/conversations')).status).toBe(401);
    const again = await request(app)
      .post('/api/v1/support/conversations')
      .set('Authorization', auth('donor'));
    expect(supportConversationResponseSchema.parse(again.body).data.id).toBe(conversationId);
    const list = await request(app)
      .get('/api/v1/support/conversations')
      .set('Authorization', auth('other'));
    expect(supportListResponseSchema.parse(list.body).data).toEqual([]);
    for (const tail of ['', '/messages']) {
      expect(
        (
          await request(app)
            .get(`/api/v1/support/conversations/${conversationId}${tail}`)
            .set('Authorization', auth('other'))
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .get(`/api/v1/support/conversations/${conversationId}${tail}`)
            .set('Authorization', auth('staff'))
        ).status,
      ).toBe(200);
    }
    expect((await send('other')).status).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/support/conversations/${conversationId}/read`)
          .set('Authorization', auth('other'))
          .send({ sequence: 0 })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/v1/support/conversations/${conversationId}`)
          .set('Authorization', auth('donor'))
          .send({ status: 'CLOSED', revision: 1 })
      ).status,
    ).toBe(403);
    expect((await send('donor', ' ')).status).toBe(400);
    expect((await send('donor', 'x'.repeat(4001))).status).toBe(400);
    expect(
      (
        await request(app)
          .get('/api/v1/support/conversations?q=private')
          .set('Authorization', auth('staff'))
      ).status,
    ).toBe(400);
  });
  it('deduplicates concurrent sends without duplicate notices, live events or audit records', async () => {
    const clientMessageId = randomUUID();
    const result = await Promise.all([
      send('donor', 'PRIVATE_SUPPORT_BODY', clientMessageId),
      send('donor', 'PRIVATE_SUPPORT_BODY', clientMessageId),
    ]);
    expect(result.map((res) => res.status)).toEqual([200, 200]);
    const first = supportSendResponseSchema.parse(result[0]?.body).data;
    expect(supportSendResponseSchema.parse(result[1]?.body).data.id).toBe(first.id);
    expect(await prisma.supportMessage.count({ where: { conversationId, clientMessageId } })).toBe(
      1,
    );
    expect(
      await prisma.inboxNotification.count({
        where: { userId: people.staff.id, conversationId, messageSequence: first.sequence },
      }),
    ).toBe(1);
    const audits = await prisma.auditLog.findMany({
      where: { action: 'support.message.send', entityId: conversationId },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain('PRIVATE_SUPPORT_BODY');
    expect((await send('donor', 'Changed payload', clientMessageId)).status).toBe(409);
  });
  it('keeps read positions per viewer and never moves them backward', async () => {
    const sent = supportSendResponseSchema.parse((await send('donor')).body).data;
    await support.markRead(conversationId, sent.sequence, actor('staff'));
    await support.markRead(conversationId, 0, actor('staff'));
    expect((await support.detail(conversationId, actor('staff'))).unreadCount).toBe(0);
    expect((await support.detail(conversationId, actor('admin'))).unreadCount).toBeGreaterThan(0);
    expect(
      (
        await request(app)
          .post(`/api/v1/support/conversations/${conversationId}/read`)
          .set('Authorization', auth('staff'))
          .send({ sequence: sent.sequence + 100 })
      ).status,
    ).toBe(400);
    const inbox = await request(app)
      .get('/api/v1/support/notifications')
      .set('Authorization', auth('staff'));
    const notice = inboxResponseSchema
      .parse(inbox.body)
      .data.find((row) => row.conversationId === conversationId);
    expect(notice?.readAt).not.toBeNull();
    if (!notice) throw new Error('Notice missing');
    expect(
      (
        await request(app)
          .post(`/api/v1/support/notifications/${notice.id}/read`)
          .set('Authorization', auth('other'))
      ).status,
    ).toBe(404);
  });
  it('serializes personnel replies, protects stale closure, and reopens on a donor message', async () => {
    const before = await support.detail(conversationId, actor('admin'));
    const replies = await Promise.all([
      send('staff', 'First reply'),
      send('admin', 'Second reply'),
    ]);
    const seq = replies
      .map((res) => supportSendResponseSchema.parse(res.body).data.sequence)
      .sort((a, b) => a - b);
    expect(seq).toEqual([before.lastSequence + 1, before.lastSequence + 2]);
    expect(
      (
        await request(app)
          .patch(`/api/v1/support/conversations/${conversationId}`)
          .set('Authorization', auth('staff'))
          .send({ status: 'CLOSED', revision: before.revision })
      ).status,
    ).toBe(409);
    const current = await support.detail(conversationId, actor('staff'));
    await support.setStatus(
      conversationId,
      { status: 'CLOSED', revision: current.revision },
      actor('staff'),
    );
    expect((await send('staff')).status).toBe(409);
    expect((await send('donor', 'Please reopen')).status).toBe(200);
    expect((await support.detail(conversationId, actor('staff'))).status).toBe('OPEN');
  });
  it('paginates stable message sequences and supports reconnect catch-up', async () => {
    const first = await support.messages(conversationId, { pageSize: 2 }, actor('staff'));
    expect(first.data).toHaveLength(2);
    const second = await support.messages(
      conversationId,
      { pageSize: 2, before: first.meta.nextBefore ?? 0 },
      actor('staff'),
    );
    expect(new Set([...first.data, ...second.data].map((row) => row.id)).size).toBe(4);
    const after = first.data.at(-1)?.sequence ?? 0;
    const sent = supportSendResponseSchema.parse(
      (await send('donor', 'After disconnect')).body,
    ).data;
    const catchup = await request(app)
      .get(`/api/v1/support/conversations/${conversationId}/messages?after=${after}`)
      .set('Authorization', auth('donor'));
    expect(supportMessagesResponseSchema.parse(catchup.body).data.map((row) => row.id)).toContain(
      sent.id,
    );
    const search = await request(app)
      .post('/api/v1/support/conversations/search')
      .set('Authorization', auth('staff'))
      .send({ q: `Support donor ${run}`, unread: 'true', page: 1, pageSize: 1 });
    expect(supportListResponseSchema.parse(search.body).data[0]?.id).toBe(conversationId);
  });
  it('rolls back sequence allocation and side effects if a message cannot be saved', async () => {
    const before = await support.detail(conversationId, actor('staff'));
    await expect(
      support.send(
        conversationId,
        { body: 'Rollback', clientMessageId: randomUUID() },
        { userId: randomUUID(), role: 'STAFF' },
      ),
    ).rejects.toThrow();
    expect((await support.detail(conversationId, actor('staff'))).lastSequence).toBe(
      before.lastSequence,
    );
  });
  it('queues generic, cooled-down unread emails and suppresses them after reading', async () => {
    const clock = new FixedClock(new Date(Date.now() + 7_200_000));
    const sent = await support.send(
      conversationId,
      { body: 'DO_NOT_EMAIL_THIS_TEXT', clientMessageId: randomUUID() },
      actor('staff'),
      clock,
    );
    const emails = await prisma.emailNotification.findMany({
      where: { type: 'SUPPORT_UNREAD', toEmail: `support-donor-${run}@example.invalid` },
      orderBy: { createdAt: 'desc' },
    });
    const latest = emails[0];
    if (!latest) throw new Error('Support email missing');
    expect(await isSupportEmailCurrent(latest.templateData)).toBe(true);
    const rendered = renderEmail('SUPPORT_UNREAD', latest.templateData, env.WEB_ORIGIN);
    expect(rendered.text).toContain('/donor/messages?conversation=');
    expect(JSON.stringify(latest.templateData) + rendered.text).not.toContain(
      'DO_NOT_EMAIL_THIS_TEXT',
    );
    await support.send(
      conversationId,
      { body: 'Another reply', clientMessageId: randomUUID() },
      actor('staff'),
      clock,
    );
    expect(
      await prisma.emailNotification.count({
        where: { type: 'SUPPORT_UNREAD', toEmail: latest.toEmail },
      }),
    ).toBe(emails.length);
    await support.markRead(conversationId, sent.sequence, actor('donor'), clock);
    expect(await isSupportEmailCurrent(latest.templateData)).toBe(false);
  });
  it('filters old staff alerts after demotion and immediately rejects deactivated access', async () => {
    try {
      await prisma.user.update({ where: { id: people.admin.id }, data: { role: 'DONOR' } });
      const inbox = await request(app)
        .get('/api/v1/support/notifications')
        .set('Authorization', auth('admin'));
      expect(
        inboxResponseSchema
          .parse(inbox.body)
          .data.some((row) => row.conversationId === conversationId),
      ).toBe(false);
      expect(
        (
          await request(app)
            .get(`/api/v1/support/conversations/${conversationId}`)
            .set('Authorization', auth('admin'))
        ).status,
      ).toBe(404);
      await prisma.user.update({ where: { id: people.other.id }, data: { isActive: false } });
      expect(
        (
          await request(app)
            .get('/api/v1/support/notifications')
            .set('Authorization', auth('other'))
        ).status,
      ).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: people.admin.id }, data: { role: 'ADMIN' } });
      await prisma.user.update({ where: { id: people.other.id }, data: { isActive: true } });
    }
  });
  it('turns committed operational email work into deduplicated private app alerts', async () => {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { slug: 'general-pool' } });
    const donation = await prisma.donation.create({
      data: {
        donorId: people.donor.id,
        campaignId: campaign.id,
        referenceNumber: `DON-SUPPORT-${run}`,
      },
    });
    const source = await prisma.emailNotification.create({
      data: {
        type: 'DONATION_VERIFIED',
        toEmail: 'fixture@example.invalid',
        subject: 'Fixture',
        templateData: {},
        dedupeKey: `support-operation:${run}`,
        relatedDonationId: donation.id,
        createdAt: new Date('1900-01-01T00:00:00Z'),
      },
    });
    await scanOperationalNotifications();
    await scanOperationalNotifications();
    expect(
      await prisma.inboxNotification.count({
        where: { dedupeKey: `operation:${source.id}:${people.donor.id}` },
      }),
    ).toBe(1);
    expect(
      await prisma.inboxNotification.count({
        where: { donationId: donation.id, userId: people.other.id },
      }),
    ).toBe(0);
  });
  it('retries live delivery failures without losing saved events', async () => {
    const userId = people.other.id;
    const event = await prisma.$transaction(async (tx) => {
      const state = await tx.liveState.upsert({
        where: { userId },
        create: { userId, revision: 1 },
        update: { revision: { increment: 1 } },
      });
      return tx.liveEvent.create({
        data: {
          userId,
          sequence: state.revision,
          topic: 'notifications',
          nextAt: new Date('1900-01-01T00:00:00Z'),
        },
      });
    });
    await dispatchLive((id) =>
      id === userId ? Promise.reject(new Error('Delivery down')) : Promise.resolve(),
    );
    expect((await prisma.liveEvent.findUniqueOrThrow({ where: { id: event.id } })).attempts).toBe(
      1,
    );
    for (let pass = 0; pass < 50; pass++) {
      await dispatchLive(() => Promise.resolve(), new FixedClock(new Date(Date.now() + 60_000)));
      if ((await prisma.liveEvent.findUniqueOrThrow({ where: { id: event.id } })).publishedAt)
        break;
    }
    expect(
      (await prisma.liveEvent.findUniqueOrThrow({ where: { id: event.id } })).publishedAt,
    ).not.toBeNull();
  });
});
