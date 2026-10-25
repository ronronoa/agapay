import { z } from 'zod';

export const operationalSettingsSchema = z
  .object({
    emailDailyLimit: z.number().int().min(1).max(100000),
    emailHourlyLimit: z.number().int().min(1).max(100000),
    lowStockDefault: z.number().int().min(0).max(1000000),
    retentionMonths: z.number().int().min(1).max(120),
    revision: z.number().int().min(0),
  })
  .strict();
export const updateSettingsSchema = operationalSettingsSchema;
export const settingsResponseSchema = z.object({ data: operationalSettingsSchema });
export type OperationalSettings = z.infer<typeof operationalSettingsSchema>;
