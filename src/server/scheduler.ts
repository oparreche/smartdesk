import 'server-only';
import { logger } from '@/src/lib/logger';
import { tickOnce } from '@/src/services/jobs/runner';
import { pollGmailConnections } from '@/src/services/gmail/poll';
import { pollAllConnections } from '@/src/services/imap/poll';
import { rescueStaleJobs, purgeOldJobs } from '@/src/services/jobs/claim';
import { pruneRateLimitHits } from '@/src/lib/rate-limit';

// Scheduler in-process. Substitui crons externos. Assume single-replica;
// se um dia rodar com replicas > 1, adicionar advisory lock no DB.

const RUNNING = new Set<string>();
let started = false;

async function run(name: string, fn: () => Promise<unknown>): Promise<void> {
  if (RUNNING.has(name)) {
    logger.warn({ task: name }, 'scheduler: previous run still in flight, skipping');
    return;
  }
  RUNNING.add(name);
  const t0 = Date.now();
  try {
    const result = await fn();
    logger.info({ task: name, ms: Date.now() - t0, result }, 'scheduler tick ok');
  } catch (err) {
    logger.error({ err, task: name, ms: Date.now() - t0 }, 'scheduler tick failed');
  } finally {
    RUNNING.delete(name);
  }
}

function every(name: string, intervalMs: number, fn: () => Promise<unknown>): void {
  // Não roda imediatamente no boot pra dar tempo do app estabilizar (DB pool, etc).
  setTimeout(() => {
    void run(name, fn);
    setInterval(() => void run(name, fn), intervalMs);
  }, 10_000);
}

function daily(name: string, hour: number, minute: number, fn: () => Promise<unknown>): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    void run(name, fn);
    setInterval(() => void run(name, fn), 24 * 60 * 60 * 1000);
  }, delay);
  logger.info({ task: name, nextAt: next.toISOString() }, 'scheduler daily task registered');
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  if (process.env.SMARTDESK_SCHEDULER_DISABLED === '1') {
    logger.info('scheduler disabled via SMARTDESK_SCHEDULER_DISABLED=1');
    return;
  }
  logger.info('scheduler starting');

  // Worker tick — drena fila de jobs (job_queue) a cada 1min
  every('jobs-tick', 60_000, () => tickOnce(20));

  // Polling de canais
  every('gmail-poll', 2 * 60_000, () => pollGmailConnections());
  every('imap-poll', 5 * 60_000, () => pollAllConnections());

  // SLA — placeholder (rota é no-op até Fase 7)
  every('sla-tick', 10 * 60_000, async () => ({ checked: 0 }));

  // Limpeza diária às 3h00 (UTC do container — 00h em BRT)
  daily('cleanup', 3, 0, async () => {
    const [rescued, purged, rateLimitPruned] = await Promise.all([
      rescueStaleJobs(),
      purgeOldJobs(),
      pruneRateLimitHits(1),
    ]);
    return { rescued, purged, rateLimitPruned };
  });
}
