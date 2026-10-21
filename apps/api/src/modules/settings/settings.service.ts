import type { OperationalSettings } from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { conflict, businessRuleViolation } from '../../lib/errors.js';
import type { AuthContext } from '../../types/express.js';
import { write } from '../audit/audit.service.js';

export async function get(): Promise<OperationalSettings> {
  const row = await prisma.operationalSettings.findUnique({ where: { id: 1 } });
  return row === null
    ? {
        emailDailyLimit: env.EMAIL_DAILY_LIMIT,
        emailHourlyLimit: env.EMAIL_HOURLY_LIMIT,
        lowStockDefault: 20,
        retentionMonths: 12,
        revision: 0,
      }
    : {
        emailDailyLimit: row.emailDailyLimit,
        emailHourlyLimit: row.emailHourlyLimit,
        lowStockDefault: row.lowStockDefault,
        retentionMonths: row.retentionMonths,
        revision: row.revision,
      };
}

export async function update(
  input: OperationalSettings,
  actor: AuthContext,
): Promise<OperationalSettings> {
  if (env.EMAIL_PROVIDER === 'resend' && input.emailDailyLimit > 100) {
    throw businessRuleViolation('The configured Resend daily limit cannot exceed 100.');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(52502)`;
    const existing = await tx.operationalSettings.findUnique({ where: { id: 1 } });
    if ((existing?.revision ?? 0) !== input.revision)
      throw conflict('Settings changed. Reload before saving.');
    const { revision, ...values } = input;
    const row = await tx.operationalSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...values, revision: revision + 1 },
      update: { ...values, revision: revision + 1 },
    });
    await write(tx, actor, {
      action: 'settings.update',
      entityType: 'OperationalSettings',
      entityId: '1',
      metadata: { ...values, revision: row.revision },
    });
    return { ...values, revision: row.revision };
  }, txOptions);
}
