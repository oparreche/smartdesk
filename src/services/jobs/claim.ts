import 'server-only';
import { prisma } from '@/src/lib/prisma';

export type ClaimedJob = {
  id: string;
  type: string;
  payload: unknown;
  organizationId: string | null;
  attempts: number;
  maxAttempts: number;
};

/**
 * Reserva atomicamente até `batchSize` jobs prontos (status=pending, runAt<=now)
 * e marca como `running` com `lockedBy=workerId`. Retorna os jobs reservados.
 *
 * Estratégia: SELECT ... FOR UPDATE SKIP LOCKED dentro de transação curta.
 * Compatível com MySQL 8+ (suporta SKIP LOCKED desde 8.0).
 */
export async function claimJobs(
  workerId: string,
  batchSize = 20,
): Promise<ClaimedJob[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM jobs
       WHERE status = 'pending' AND run_at <= NOW()
       ORDER BY priority DESC, run_at ASC
       LIMIT ${batchSize}
       FOR UPDATE SKIP LOCKED`,
    );

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const now = new Date();

    await tx.job.updateMany({
      where: { id: { in: ids } },
      data: { status: 'running', lockedAt: now, lockedBy: workerId },
    });

    const claimed = await tx.job.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        type: true,
        payload: true,
        organizationId: true,
        attempts: true,
        maxAttempts: true,
      },
    });

    return claimed;
  });
}

/**
 * Marca como `succeeded`.
 */
export async function completeJob(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'succeeded',
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

/**
 * Marca como `failed` (retry) ou `dead` (sem mais tentativas) com backoff exponencial.
 */
export async function failJob(jobId: string, error: Error): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true },
  });
  if (!job) return;

  const nextAttempts = job.attempts + 1;
  const isDead = nextAttempts >= job.maxAttempts;

  const backoffSec = Math.min(3600, 30 * 2 ** nextAttempts) + Math.floor(Math.random() * 15);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: isDead ? 'dead' : 'pending',
      attempts: nextAttempts,
      lockedAt: null,
      lockedBy: null,
      lastError: error.message.slice(0, 5000),
      runAt: isDead ? new Date() : new Date(Date.now() + backoffSec * 1000),
      completedAt: isDead ? new Date() : null,
    },
  });
}

/**
 * Recupera jobs travados (status=running com lockedAt antigo). Retorna count.
 */
export async function rescueStaleJobs(maxLockSeconds = 5 * 60): Promise<number> {
  const cutoff = new Date(Date.now() - maxLockSeconds * 1000);
  const stale = await prisma.job.findMany({
    where: { status: 'running', lockedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  const now = new Date();
  await prisma.job.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: {
      status: 'pending',
      lockedAt: null,
      lockedBy: null,
      lastError: 'rescued from stale running state',
      runAt: now,
    },
  });
  return stale.length;
}

/**
 * Apaga jobs `succeeded` com mais de N dias.
 */
export async function purgeOldJobs(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
  const r = await prisma.job.deleteMany({
    where: { status: 'succeeded', completedAt: { lt: cutoff } },
  });
  return r.count;
}
