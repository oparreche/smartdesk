// Setup compartilhado para todos os testes Vitest.
// Define variáveis mínimas pro src/lib/env.ts não derrubar a importação.

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV ??= 'test';
env.APP_URL ??= 'http://localhost:3000';
env.DATABASE_URL ??= 'mysql://test:test@localhost:3306/test_db';
env.AUTH_SECRET ??= 'test-auth-secret-with-enough-bytes-1234567890';
env.AUTH_TRUST_HOST ??= 'true';
env.ENCRYPTION_KEY_BASE64 ??= Buffer.alloc(32, 1).toString('base64');
env.CRON_SECRET ??= 'test-cron-secret-1234567890';
env.S3_ENDPOINT ??= 'http://localhost:9000';
env.S3_REGION ??= 'us-east-1';
env.S3_BUCKET ??= 'test-bucket';
env.S3_ACCESS_KEY ??= 'minioadmin';
env.S3_SECRET_KEY ??= 'minioadmin';
env.LOG_LEVEL ??= 'error';
