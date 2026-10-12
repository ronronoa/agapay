import type { Prisma } from '@prisma/client';
import { internal } from './errors.js';

export async function nextSequence(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "SequenceCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "SequenceCounter"."value" + 1
    RETURNING "value"`;
  const first: { value: number } | undefined = rows[0];
  if (first === undefined) throw internal('Sequence counter returned no value.');
  return first.value;
}

export function donationReference(year: number, value: number): string {
  return `DON-${year}-${String(value).padStart(6, '0')}`;
}
