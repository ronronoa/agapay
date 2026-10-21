import { get as getSettings } from '../modules/settings/settings.service.js';
import { renderScheduleEmail, isScheduleCurrent } from '../modules/notifications/schedule-email.js';
import { scanReminders } from './reminders.js';
import { syncCalendars } from './calendar-sync.js';
import PgBoss from 'pg-boss';
import { prisma } from '../lib/prisma.js';
import { systemClock, type Clock } from '../lib/clock.js';
import { startOfUtcDay } from '../lib/dates.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { createEmailProvider, type EmailProvider } from '../modules/notifications/email/index.js';
import { renderEmail } from '../modules/notifications/templates/render.js';

const SWEEP_QUEUE = 'email.sweep';
const SWEEP_CRON = '* * * * *';
const BATCH_SIZE = 10;
const MAX_PASSES = 10;
const MAX_ATTEMPTS = 5;
// Gaps between attempts: 1m, 5m, 30m, 2h, 12h (architecture.md §4.3).
const BACKOFF_MS: readonly number[] = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
const LAST_BACKOFF_MS = 43_200_000;

export interface DrainResult {
  claimed: number;
  sent: number;
  failed: number;
  skippedOverBudget: number;
}

export interface DrainOverrides {
  clock?: Clock;
  provider?: EmailProvider;
}

let boss: PgBoss | undefined;
let draining = false;

export function isOverBudget(sentToday: number, limit: number): boolean {
  return sentToday >= limit;
}

// Gmail throttles per hour as well as per day, so both budgets bind. Critical
// mail (priority 1) bypasses both, matching the daily rule.
export function shouldSkip(
  priority: number,
  sentToday: number,
  sentThisHour: number,
  limits = { emailDailyLimit: env.EMAIL_DAILY_LIMIT, emailHourlyLimit: env.EMAIL_HOURLY_LIMIT },
): boolean {
  return (
    priority > 1 &&
    (isOverBudget(sentToday, limits.emailDailyLimit) ||
      isOverBudget(sentThisHour, limits.emailHourlyLimit))
  );
}

function nextRetryAt(now: Date, attempts: number): Date {
  const step: number = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1] ?? LAST_BACKOFF_MS;
  return new Date(now.getTime() + step);
}

async function drainBatch(
  clock: Clock,
  provider: EmailProvider,
  result: DrainResult,
): Promise<boolean> {
  const now = clock.now();
  const due = await prisma.emailNotification.findMany({
    where: { status: 'QUEUED', scheduledFor: { lte: now } },
    orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }],
    take: BATCH_SIZE,
    select: {
      id: true,
      type: true,
      templateData: true,
      priority: true,
      dedupeKey: true,
      toEmail: true,
    },
  });
  if (due.length === 0) return false;

  // Counts run in parallel: each is a round trip to the database, and this
  // path runs on every sweep.
  let [sentToday, sentThisHour] = await Promise.all([
    prisma.emailNotification.count({
      where: { status: 'SENT', sentAt: { gte: startOfUtcDay(now) } },
    }),
    // Rolling hour, not the clock hour: a burst at 10:59 must not reset at 11:00.
    prisma.emailNotification.count({
      where: { status: 'SENT', sentAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    }),
  ]);

  const limits = await getSettings();
  let claimedAny = false;
  for (const row of due) {
    // Conditional claim so two sweeps can never send the same row twice.
    const claim = await prisma.emailNotification.updateMany({
      where: { id: row.id, status: 'QUEUED' },
      data: { status: 'SENDING' },
    });
    if (claim.count === 0) continue;
    claimedAny = true;
    result.claimed += 1;

    if (shouldSkip(row.priority, sentToday, sentThisHour, limits)) {
      result.skippedOverBudget += 1;
      await prisma.emailNotification.update({
        where: { id: row.id },
        data: { status: 'QUEUED' },
      });
      continue;
    }

    try {
      if (!(await isScheduleCurrent(row.templateData, clock))) {
        await prisma.emailNotification.update({
          where: { id: row.id },
          data: { status: 'SUPPRESSED' },
        });
        continue;
      }
      const schedule = renderScheduleEmail(row.templateData);
      const rendered = schedule ?? renderEmail(row.type, row.templateData, env.WEB_ORIGIN);
      const sendResult = await provider.send({
        to: row.toEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(schedule ? { attachments: schedule.attachments } : {}),
        dedupeKey: row.dedupeKey,
      });
      await prisma.emailNotification.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          providerMessageId: sendResult.providerMessageId ?? null,
          sentAt: clock.now(),
        },
      });
      sentToday += 1;
      sentThisHour += 1;
      result.sent += 1;
      logger.info({ notificationId: row.id, type: row.type }, 'email sent');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown send failure';
      const updated = await prisma.emailNotification.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (updated.attempts >= MAX_ATTEMPTS) {
        await prisma.emailNotification.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: message.slice(0, 500) },
        });
        result.failed += 1;
        logger.warn(
          { notificationId: row.id, type: row.type, attempts: updated.attempts },
          'email failed permanently',
        );
      } else {
        await prisma.emailNotification.update({
          where: { id: row.id },
          data: {
            status: 'QUEUED',
            scheduledFor: nextRetryAt(clock.now(), updated.attempts),
            lastError: message.slice(0, 500),
          },
        });
        logger.warn(
          { notificationId: row.id, type: row.type, attempts: updated.attempts },
          'email send failed; retry scheduled',
        );
      }
    }
  }
  return claimedAny;
}

export async function drainOnce(overrides: DrainOverrides = {}): Promise<DrainResult> {
  if (draining) return { claimed: 0, sent: 0, failed: 0, skippedOverBudget: 0 };
  draining = true;
  try {
    const clock = overrides.clock ?? systemClock;
    const provider = overrides.provider ?? createEmailProvider();
    const result: DrainResult = { claimed: 0, sent: 0, failed: 0, skippedOverBudget: 0 };
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const claimedAny = await drainBatch(clock, provider, result);
      if (!claimedAny) break;
    }
    return result;
  } finally {
    draining = false;
  }
}

export async function startEmailWorker(): Promise<void> {
  if (boss !== undefined) return;
  // pg-boss needs the direct connection; pooled connections do not support
  // the locking it relies on (architecture.md §9).
  const instance = new PgBoss(env.DIRECT_URL);
  instance.on('error', (err: Error) => {
    logger.error({ err }, 'pg-boss error');
  });
  await instance.start();
  // create_queue() is idempotent (ON CONFLICT DO NOTHING), so this is safe on
  // every boot. The queue row must exist before schedule(), whose table holds
  // a foreign key to it — scheduling first fails with "Queue not found".
  await instance.createQueue(SWEEP_QUEUE);
  await instance.work(SWEEP_QUEUE, async (): Promise<unknown> => {
    await drainOnce();
    return undefined;
  });
  // Upsert on (name): re-running only refreshes the cron expression.
  await instance.schedule(SWEEP_QUEUE, SWEEP_CRON);
  await instance.createQueue('reminders.scan');
  await instance.work('reminders.scan', async () => {
    await scanReminders();
  });
  await instance.schedule('reminders.scan', '0 * * * *');
  await instance.createQueue('calendar.sync');
  await instance.work('calendar.sync', async () => {
    await syncCalendars();
  });
  await instance.schedule('calendar.sync', '* * * * *');
  await scanReminders();
  await syncCalendars();
  boss = instance;
  logger.info('email worker started');
  await drainOnce();
}

export async function stopEmailWorker(): Promise<void> {
  if (boss === undefined) return;
  const instance = boss;
  boss = undefined;
  await instance.stop();
  logger.info('email worker stopped');
}
