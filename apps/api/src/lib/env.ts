import { z } from 'zod';

// Parsed once at import so a bad value crashes at boot, not on the first request
// that needs it. Optional settings are added when their module lands, so a
// half-configured environment cannot boot (TS-28).
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),

    WEB_ORIGIN: z.string().url(),

    EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).default('Agapay <no-reply@example.com>'),
    // Resend's free tier is 100 emails/day (PLAN.md §2.2), so the budget sits
    // below it with headroom for retries. Raising this past the plan limit
    // silently suppresses nothing — it just starts failing sends.
    EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(90),
  })
  // Cross-field check: selecting a real provider without its credential would
  // otherwise fail later, inside a worker, at 3am.
  .refine((value) => value.EMAIL_PROVIDER !== 'resend' || Boolean(value.RESEND_API_KEY), {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is "resend"',
    path: ['RESEND_API_KEY'],
  })
  .refine((value) => value.EMAIL_DAILY_LIMIT <= 100, {
    message: 'EMAIL_DAILY_LIMIT above 100 exceeds the Resend free-tier daily cap',
    path: ['EMAIL_DAILY_LIMIT'],
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }
  return Object.freeze(parsed.data);
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
