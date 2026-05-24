import 'server-only';
import { randomUUID } from 'node:crypto';
import { logger } from '@/src/lib/logger';
import { claimJobs, completeJob, failJob, type ClaimedJob } from './claim';
import { getJobHandler } from './registry';

export type TickResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

const HARD_JOB_TIMEOUT_MS = 25_000;

async function runOne(job: ClaimedJob): Promise<{ ok: boolean }> {
  const handler = getJobHandler(job.type);
  if (!handler) {
    await failJob(job.id, new Error(`no_handler:${job.type}`));
    logger.warn({ jobId: job.id, type: job.type }, 'job has no registered handler');
    return { ok: false };
  }

  const t0 = Date.now();
  try {
    await Promise.race([
      handler(job.payload, {
        jobId: job.id,
        organizationId: job.organizationId,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('job_timeout')), HARD_JOB_TIMEOUT_MS),
      ),
    ]);
    await completeJob(job.id);
    logger.info(
      { jobId: job.id, type: job.type, ms: Date.now() - t0, org: job.organizationId },
      'job ok',
    );
    return { ok: true };
  } catch (err) {
    const e = err as Error;
    await failJob(job.id, e);
    logger.warn(
      { jobId: job.id, type: job.type, ms: Date.now() - t0, err: e.message },
      'job failed',
    );
    return { ok: false };
  }
}

export async function tickOnce(batchSize = 20): Promise<TickResult> {
  // Garante side-effect import dos handlers (registra no registry)
  await import('./handlers');

  const workerId = randomUUID();
  const jobs = await claimJobs(workerId, batchSize);

  if (jobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  await Promise.all(
    jobs.map(async (j) => {
      const r = await runOne(j);
      if (r.ok) succeeded++;
      else failed++;
    }),
  );

  return { processed: jobs.length, succeeded, failed };
}
