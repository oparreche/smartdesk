/**
 * dev-cron — bate nos endpoints /api/cron/* em intervalos pequenos.
 *
 * Em prod usamos cron do host / Vercel Cron. Aqui é só pra simular.
 * Rodar com `pnpm dev:cron` (em outro terminal, junto com `pnpm dev`).
 */
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('CRON_SECRET ausente — verifique .env.local');
  process.exit(1);
}

type Beat = {
  path: string;
  intervalMs: number;
};

const BEATS: Beat[] = [
  { path: '/api/cron/jobs-tick', intervalMs: 5_000 },
  { path: '/api/cron/gmail-poll', intervalMs: 60_000 },
  { path: '/api/cron/imap-poll', intervalMs: 60_000 },
  { path: '/api/cron/sla-tick', intervalMs: 60_000 },
  { path: '/api/cron/cleanup', intervalMs: 5 * 60_000 },
];

async function hit(beat: Beat) {
  const url = `${APP_URL}${beat.path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const ms = Date.now() - t0;
    const body = await res.text().catch(() => '');
    if (res.ok) {
      console.log(`[${new Date().toISOString()}] ${beat.path} ${res.status} ${ms}ms ${body.slice(0, 100)}`);
    } else {
      console.warn(`[${new Date().toISOString()}] ${beat.path} ${res.status} ${ms}ms ${body.slice(0, 200)}`);
    }
  } catch (err) {
    const ms = Date.now() - t0;
    console.warn(`[${new Date().toISOString()}] ${beat.path} ERROR ${ms}ms ${(err as Error).message}`);
  }
}

console.log(`dev-cron iniciado. Batendo em ${APP_URL}/api/cron/*`);
for (const beat of BEATS) {
  setTimeout(() => hit(beat), 1000);
  setInterval(() => hit(beat), beat.intervalMs);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
