import { z } from 'zod';
import { emailSchema, passwordSchema } from '@agapay/shared';

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
    COOKIE_DOMAIN: z.string().optional(),

    WEB_ORIGIN: z.string().url(),

    EMAIL_PROVIDER: z.enum(['resend', 'smtp', 'console']).default('console'),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Gmail SMTP takes an app password, never the account password.
    SMTP_HOST: z.string().min(1).default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    // Not z.coerce.boolean(): it turns the string "false" into true, which
    // would attempt implicit TLS on 587 and hang every send.
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).default('Agapay <no-reply@example.com>'),
    // Resend's free tier is 100 emails/day (PLAN.md §2.2), so the budget sits
    // below it with headroom for retries. Raising this past the plan limit
    // silently suppresses nothing — it just starts failing sends.
    EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(90),
    // Gmail throttles by volume per hour, not just per day, so a burst can be
    // rejected long before the daily budget is spent.
    EMAIL_HOURLY_LIMIT: z.coerce.number().int().positive().default(60),

    GOOGLE_CALENDAR_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1).optional(),
    TURNSTILE_SECRET: z.string().min(1).optional(),

    // Local inventory-photo storage. Resolved against the API working directory;
    // production on ephemeral disks needs a persistent volume or object storage.
    UPLOAD_DIR: z.string().min(1).default('uploads'),
    UPLOAD_MAX_IMAGE_MB: z.coerce.number().int().min(1).max(25).default(5),

    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().default('meta-llama/llama-3.3-70b-instruct:free'),
    OPENROUTER_FALLBACK_MODELS: z.string().default(''),
    CHAT_USER_DAILY_LIMIT: z.coerce.number().int().positive().default(15),
    CHAT_GLOBAL_DAILY_LIMIT: z.coerce.number().int().positive().default(40),

    SEED_ADMIN_EMAIL: emailSchema.optional(),
    SEED_ADMIN_PASSWORD: passwordSchema.optional(),
    SEED_STAFF_EMAIL: emailSchema.optional(),
    SEED_STAFF_PASSWORD: passwordSchema.optional(),
    SEED_DEMO_PASSWORD: passwordSchema.optional(),
  })
  .refine(
    (v) =>
      !v.GOOGLE_CALENDAR_ENABLED ||
      Boolean(
        v.GOOGLE_CALENDAR_ID &&
        v.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        v.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
      ),
    {
      message: 'Google Calendar credentials are required when enabled',
      path: ['GOOGLE_CALENDAR_ID'],
    },
  )
  // Cross-field check: selecting a real provider without its credential would
  // otherwise fail later, inside a worker, at 3am.
  .refine((value) => value.EMAIL_PROVIDER !== 'resend' || Boolean(value.RESEND_API_KEY), {
    message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is "resend"',
    path: ['RESEND_API_KEY'],
  })
  .refine(
    (value) => value.EMAIL_PROVIDER !== 'smtp' || Boolean(value.SMTP_USER && value.SMTP_PASS),
    {
      message: 'SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER is "smtp"',
      path: ['SMTP_PASS'],
    },
  )
  .refine((value) => value.EMAIL_PROVIDER !== 'resend' || value.EMAIL_DAILY_LIMIT <= 100, {
    message: 'EMAIL_DAILY_LIMIT above 100 exceeds the Resend free-tier daily cap',
    path: ['EMAIL_DAILY_LIMIT'],
  })
  // Half a bootstrap admin is worse than none: it would silently leave the
  // system with no way in.
  .refine(
    (value) => (value.SEED_ADMIN_EMAIL === undefined) === (value.SEED_ADMIN_PASSWORD === undefined),
    {
      message: 'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set together',
      path: ['SEED_ADMIN_PASSWORD'],
    },
  )
  // Same both-or-neither rule for the demo staff account.
  .refine(
    (value) => (value.SEED_STAFF_EMAIL === undefined) === (value.SEED_STAFF_PASSWORD === undefined),
    {
      message: 'SEED_STAFF_EMAIL and SEED_STAFF_PASSWORD must be set together',
      path: ['SEED_STAFF_PASSWORD'],
    },
  );

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
