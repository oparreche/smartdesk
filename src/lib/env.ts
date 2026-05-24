import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(16),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().url().optional(),

  ENCRYPTION_KEY_BASE64: z
    .string()
    .min(1, 'ENCRYPTION_KEY_BASE64 is required (run `pnpm gen-key`)')
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes',
    ),

  CRON_SECRET: z.string().min(16),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Email transacional (forgot-password, verify-email, notificações)
  // Dev: MailHog roda em smtp://localhost:1025 sem auth, UI em http://localhost:8025
  // Prod: Resend / SES / Mailgun via SMTP
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  EMAIL_FROM: z.string().default('SmartDesk <noreply@smartdesk.local>'),

  // IA — Gemini (Google AI Studio). Opcional. Quando ausente, UI mostra "IA não configurada".
  // Gere em https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
});

// Durante `next build` em containers (Dockerfile/CI) as envs vivem só em runtime.
// SKIP_ENV_VALIDATION=1 injeta placeholders para required fields para que os
// defaults() do schema sejam aplicados (módulos como pino precisam de LOG_LEVEL).
// Runtime ainda valida normalmente.
if (process.env.SKIP_ENV_VALIDATION === '1') {
  process.env.APP_URL ??= 'http://placeholder.local';
  process.env.DATABASE_URL ??= 'mysql://placeholder:x@localhost:3306/placeholder';
  process.env.AUTH_SECRET ??= 'placeholder-build-only-secret-1234';
  process.env.ENCRYPTION_KEY_BASE64 ??= Buffer.alloc(32).toString('base64');
  process.env.CRON_SECRET ??= 'placeholder-build-only-cron-1234';
  process.env.S3_ENDPOINT ??= 'http://placeholder.local';
  process.env.S3_REGION ??= 'us-east-1';
  process.env.S3_BUCKET ??= 'placeholder';
  process.env.S3_ACCESS_KEY ??= 'placeholder';
  process.env.S3_SECRET_KEY ??= 'placeholder';
}

const parsed = Env.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('Missing or invalid environment variables. See .env.example.');
}

export const env = parsed.data;
export type Env = typeof env;
