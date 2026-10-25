import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { liveAuthSchema, liveFrameSchema, type LiveFrame } from '@agapay/shared';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { hashToken } from '../auth/password.js';
import { systemClock, type Clock } from '../../lib/clock.js';
import { catchUp } from './live.service.js';
import { scanOperationalNotifications } from './inbox.service.js';

type Connection = {
  socket: WebSocket;
  userId: string;
  sessionId: string;
  role: string;
  authExpiresAt: Date;
  queue: Promise<void>;
  alive: boolean;
};
async function valid(connection: Connection, clock: Clock) {
  if (connection.authExpiresAt <= clock.now()) return false;
  const row = await prisma.refreshToken.findUnique({
    where: { id: connection.sessionId },
    include: { user: true },
  });
  return (
    row !== null &&
    row.revokedAt === null &&
    row.expiresAt > clock.now() &&
    row.user.isActive &&
    row.userId === connection.userId &&
    row.user.role === connection.role
  );
}
async function permitted(connection: Connection, frame: LiveFrame) {
  if (frame.type !== 'event' || !frame.conversationId || connection.role !== 'DONOR') return true;
  return (
    (await prisma.supportConversation.count({
      where: { id: frame.conversationId, donorId: connection.userId },
    })) === 1
  );
}
function send(connection: Connection, frame: LiveFrame) {
  connection.queue = connection.queue
    .catch(() => {})
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (connection.socket.readyState !== WebSocket.OPEN) {
            reject(new Error('Socket closed'));
            return;
          }
          const timer = setTimeout(() => {
            connection.socket.terminate();
            reject(new Error('Socket timeout'));
          }, 2000);
          connection.socket.send(JSON.stringify(frame), (error) => {
            clearTimeout(timer);
            if (error) {
              connection.socket.terminate();
              reject(new Error('Socket delivery failed'));
            } else resolve();
          });
        }),
    );
  return connection.queue;
}
export async function dispatchLive(
  deliver: (userId: string, frame: LiveFrame) => Promise<void>,
  clock: Clock = systemClock,
) {
  const rows = await prisma.liveEvent.findMany({
    where: { publishedAt: null, attempts: { lt: 5 }, nextAt: { lte: clock.now() } },
    orderBy: [{ nextAt: 'asc' }, { userId: 'asc' }, { sequence: 'asc' }],
    take: 100,
  });
  for (const row of rows) {
    try {
      const frame = liveFrameSchema.parse({
        type: 'event',
        id: row.id,
        sequence: row.sequence,
        topic: row.topic,
        conversationId: row.conversationId,
      });
      await deliver(row.userId, frame);
      await prisma.liveEvent.updateMany({
        where: { id: row.id, publishedAt: null },
        data: { publishedAt: clock.now() },
      });
    } catch {
      await prisma.liveEvent.updateMany({
        where: { id: row.id, publishedAt: null },
        data: {
          attempts: { increment: 1 },
          nextAt: new Date(clock.now().getTime() + Math.min(60_000, 1000 * 2 ** row.attempts)),
        },
      });
    }
  }
}

export function attachRealtime(server: Server, options: { clock?: Clock; worker?: boolean } = {}) {
  const clock = options.clock ?? systemClock;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const connections = new Set<Connection>();
  const ipCounts = new Map<string, number>();
  let working = false;
  let stopped = false;
  async function deliver(userId: string, frame: LiveFrame) {
    for (const connection of connections) {
      if (connection.userId !== userId) continue;
      if (!(await valid(connection, clock))) {
        connection.socket.close(1008, 'Session changed');
        continue;
      }
      if (await permitted(connection, frame)) await send(connection, frame);
    }
  }
  // Use a named listener so shutdown detaches only this feature's upgrade hook.
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url !== '/api/v1/live') {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    if (
      req.headers.origin !== env.WEB_ORIGIN ||
      (env.NODE_ENV === 'production' &&
        !('encrypted' in req.socket && req.socket.encrypted) &&
        req.headers['x-forwarded-proto'] !== 'https')
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? (forwarded.split(',').at(-1)?.trim() ?? 'unknown')
        : (req.socket.remoteAddress ?? 'unknown');
    if ((ipCounts.get(ip) ?? 0) >= 10 || wss.clients.size >= 500) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return;
    }
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    socket.once('close', () => {
      const count = Math.max(0, (ipCounts.get(ip) ?? 1) - 1);
      if (count) ipCounts.set(ip, count);
      else ipCounts.delete(ip);
    });
    wss.handleUpgrade(req, socket, head, (ws) => {
      let connection: Connection | undefined;
      let authenticating = false;
      const deadline = setTimeout(() => ws.close(1008, 'Authentication required'), 5000);
      ws.on('error', () => ws.terminate());
      ws.on('close', () => {
        clearTimeout(deadline);
        if (connection) connections.delete(connection);
      });
      ws.on('pong', () => {
        if (connection) connection.alive = true;
      });
      ws.on('message', (data, binary) => {
        if (connection || authenticating || binary) {
          ws.close(1008, 'Only authentication is accepted');
          return;
        }
        authenticating = true;
        void (async () => {
          let raw: unknown;
          try {
            const bytes = Array.isArray(data)
              ? Buffer.concat(data)
              : data instanceof ArrayBuffer
                ? Buffer.from(data)
                : data;
            raw = JSON.parse(bytes.toString('utf8'));
          } catch {
            ws.close(1008, 'Invalid frame');
            return;
          }
          const parsed = liveAuthSchema.safeParse(raw);
          if (!parsed.success) {
            ws.close(1008, 'Invalid frame');
            return;
          }
          const ticket = await prisma.$transaction(async (tx) => {
            const changed = await tx.socketTicket.updateMany({
              where: {
                hash: hashToken(parsed.data.ticket),
                usedAt: null,
                expiresAt: { gt: clock.now() },
                authExpiresAt: { gt: clock.now() },
              },
              data: { usedAt: clock.now() },
            });
            return changed.count
              ? tx.socketTicket.findUnique({ where: { hash: hashToken(parsed.data.ticket) } })
              : null;
          });
          if (!ticket) {
            ws.close(1008, 'Ticket expired or used');
            return;
          }
          if ([...connections].filter((c) => c.userId === ticket.userId).length >= 5) {
            ws.close(1008, 'Connection limit');
            return;
          }
          connection = {
            socket: ws,
            userId: ticket.userId,
            sessionId: ticket.sessionId,
            role: ticket.role,
            authExpiresAt: ticket.authExpiresAt,
            queue: Promise.resolve(),
            alive: true,
          };
          if (!(await valid(connection, clock)) || ws.readyState !== WebSocket.OPEN) {
            ws.close(1008, 'Session changed');
            return;
          }
          clearTimeout(deadline);
          connections.add(connection);
          let cursor = parsed.data.cursor;
          // Bound replay; ready always tells the client to reconcile authoritative HTTP snapshots.
          for (let page = 0; page < 10; page++) {
            const rows = await catchUp(ticket.userId, cursor);
            if (!rows.length) break;
            for (const row of rows) {
              if (!(await valid(connection, clock))) {
                ws.close(1008, 'Session changed');
                return;
              }
              const frame = liveFrameSchema.parse({
                type: 'event',
                id: row.id,
                sequence: row.sequence,
                topic: row.topic,
                conversationId: row.conversationId,
              });
              if (await permitted(connection, frame)) await send(connection, frame);
              cursor = row.sequence;
            }
          }
          const state = await prisma.liveState.findUnique({ where: { userId: ticket.userId } });
          await send(connection, { type: 'ready', cursor: state?.revision ?? 0 });
        })().catch(() => {
          ws.close(1011, 'Connection unavailable');
        });
      });
    });
  };
  server.on('upgrade', onUpgrade);
  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      void valid(connection, clock)
        .then((ok) => {
          if (!ok) connection.socket.close(1008, 'Session changed');
          else if (connection.socket.readyState === WebSocket.OPEN) connection.socket.ping();
        })
        .catch(() => connection.socket.close(1011, 'Connection unavailable'));
    }
  }, 15_000);
  heartbeat.unref();
  const worker = setInterval(() => {
    if (working || stopped || options.worker === false) return;
    working = true;
    void (async () => {
      await scanOperationalNotifications(clock);
      await dispatchLive(deliver, clock);
      await prisma.socketTicket.deleteMany({
        where: { expiresAt: { lt: new Date(clock.now().getTime() - 3_600_000) } },
      });
    })()
      .catch(() => logger.warn('Realtime delivery will retry after a worker failure'))
      .finally(() => {
        working = false;
      });
  }, 1000);
  worker.unref();
  return {
    deliver,
    async stop() {
      stopped = true;
      clearInterval(worker);
      clearInterval(heartbeat);
      server.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
