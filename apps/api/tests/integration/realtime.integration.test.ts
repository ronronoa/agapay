import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import request from 'supertest';
import { WebSocket } from 'ws';
import {
  accessTokenResponseSchema,
  liveFrameSchema,
  socketTicketResponseSchema,
  type LiveFrame,
} from '@agapay/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { env } from '../../src/lib/env.js';
import { FixedClock } from '../../src/lib/clock.js';
import { hashPassword, hashToken } from '../../src/modules/auth/password.js';
import { attachRealtime, dispatchLive } from '../../src/modules/support/realtime.js';
import { emitLive } from '../../src/modules/support/live.service.js';

const clock = new FixedClock(new Date());
const server = createServer(createApp());
const live = attachRealtime(server, { clock, worker: false });
const sockets = new Set<WebSocket>();
const userIds: string[] = [];
let url = '';
let seq = 0;
const run = `${process.pid}-${Date.now()}`;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  url = `ws://127.0.0.1:${address.port}/api/v1/live`;
});
afterEach(() => {
  for (const ws of sockets) ws.terminate();
  sockets.clear();
  clock.set(new Date());
});
afterAll(async () => {
  await live.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { isActive: false } });
  await prisma.liveEvent.deleteMany({ where: { userId: { in: userIds } } });
});
async function person() {
  const email = `socket-${run}-${seq++}@example.invalid`;
  const password = 'socket integration secret';
  const user = await prisma.user.create({
    data: {
      name: 'Socket fixture',
      email,
      passwordHash: await hashPassword(password),
      role: 'DONOR',
    },
  });
  userIds.push(user.id);
  const agent = request.agent(server);
  const login = await agent
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', `198.19.2.${seq}`)
    .send({ email, password });
  const token = accessTokenResponseSchema.parse(login.body).data.accessToken;
  return { user, agent, token };
}
async function ticket(p: Awaited<ReturnType<typeof person>>) {
  const res = await p.agent
    .post('/api/v1/auth/realtime-ticket')
    .set('Authorization', `Bearer ${p.token}`)
    .set('x-requested-with', 'agapay');
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('no-store');
  return socketTicketResponseSchema.parse(res.body).data.ticket;
}
function open(token: string, cursor = 0) {
  const ws = new WebSocket(url, { origin: env.WEB_ORIGIN });
  sockets.add(ws);
  const frames: LiveFrame[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket readiness timed out')), 4000);
    ws.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Socket unavailable'));
    });
    ws.on('close', () => {
      clearTimeout(timer);
      reject(new Error('Socket closed before readiness'));
    });
    ws.on('message', (data) => {
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      const frame = liveFrameSchema.parse(JSON.parse(bytes.toString('utf8')));
      frames.push(frame);
      if (frame.type === 'ready') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  ws.on('open', () => ws.send(JSON.stringify({ type: 'authenticate', ticket: token, cursor })));
  return { ws, frames, ready };
}
function closed(ws: WebSocket) {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket closure timed out')), 4000);
    ws.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
describe('M5F WebSocket protocol with real PostgreSQL', () => {
  it('binds authenticated streams to their user and sends metadata only', async () => {
    const a = await person(),
      b = await person();
    const first = open(await ticket(a)),
      second = open(await ticket(b));
    await Promise.all([first.ready, second.ready]);
    await prisma.$transaction((tx) => emitLive(tx, [a.user.id], 'notifications'));
    const event = await prisma.liveEvent.findFirstOrThrow({ where: { userId: a.user.id } });
    const arrived = new Promise<void>((resolve) => first.ws.once('message', () => resolve()));
    await live.deliver(
      a.user.id,
      liveFrameSchema.parse({
        type: 'event',
        id: event.id,
        sequence: event.sequence,
        topic: event.topic,
        conversationId: null,
      }),
    );
    await arrived;
    expect(first.frames.some((f) => f.type === 'event' && f.id === event.id)).toBe(true);
    expect(second.frames.some((f) => f.type === 'event')).toBe(false);
    expect(JSON.stringify(first.frames)).not.toContain(a.user.email);
    expect(JSON.stringify(first.frames)).not.toContain('body');
  });
  it('replays committed events after disconnect using a stable cursor', async () => {
    const p = await person();
    const original = open(await ticket(p));
    await original.ready;
    const close = closed(original.ws);
    original.ws.close();
    await close;
    await prisma.$transaction((tx) => emitLive(tx, [p.user.id], 'notifications'));
    const event = await prisma.liveEvent.findFirstOrThrow({ where: { userId: p.user.id } });
    await dispatchLive(live.deliver);
    const resumed = open(await ticket(p), 0);
    await resumed.ready;
    expect(
      resumed.frames.some(
        (frame) =>
          frame.type === 'event' && frame.id === event.id && frame.sequence === event.sequence,
      ),
    ).toBe(true);
    expect(resumed.frames.at(-1)).toEqual({ type: 'ready', cursor: event.sequence });
  });
  it('consumes tickets once and rejects expired tickets without revealing records', async () => {
    const p = await person();
    const once = await ticket(p);
    const first = open(once);
    await first.ready;
    const again = open(once);
    const rejected = again.ready.catch(() => {});
    expect(await closed(again.ws)).toBe(1008);
    await rejected;
    const expired = await ticket(p);
    await prisma.socketTicket.update({
      where: { hash: hashToken(expired) },
      data: { expiresAt: new Date(0) },
    });
    const stale = open(expired);
    const staleReady = stale.ready.catch(() => {});
    expect(await closed(stale.ws)).toBe(1008);
    await staleReady;
  });
  it('denies foreign origins and requires both bearer authentication and its refresh session', async () => {
    const p = await person();
    expect(
      (
        await request(server)
          .post('/api/v1/auth/realtime-ticket')
          .set('Authorization', `Bearer ${p.token}`)
          .set('x-requested-with', 'agapay')
      ).status,
    ).toBe(401);
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(url, { origin: 'https://foreign.example.invalid' });
      sockets.add(ws);
      ws.on('error', () => {});
      ws.on('unexpected-response', (_req, res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
        ws.terminate();
      });
    });
    expect(code).toBe(403);
  });
  it.each(['role', 'deactivated', 'revoked', 'expired'])(
    'stops delivery after the session is %s',
    async (mode) => {
      const p = await person();
      const connected = open(await ticket(p));
      await connected.ready;
      if (mode === 'role')
        await prisma.user.update({ where: { id: p.user.id }, data: { role: 'STAFF' } });
      if (mode === 'deactivated')
        await prisma.user.update({ where: { id: p.user.id }, data: { isActive: false } });
      if (mode === 'revoked')
        await prisma.refreshToken.updateMany({
          where: { userId: p.user.id },
          data: { revokedAt: new Date() },
        });
      if (mode === 'expired') clock.advance(16 * 60_000);
      const ending = closed(connected.ws);
      await live.deliver(p.user.id, { type: 'ready', cursor: 0 });
      expect(await ending).toBe(1008);
      expect(connected.frames.filter((frame) => frame.type === 'ready')).toHaveLength(1);
    },
  );
  it('rejects attempts to subscribe to another user after authentication', async () => {
    const p = await person();
    const connected = open(await ticket(p));
    await connected.ready;
    const ending = closed(connected.ws);
    connected.ws.send(JSON.stringify({ type: 'subscribe', userId: 'another-user' }));
    expect(await ending).toBe(1008);
  });
});
