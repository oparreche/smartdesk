import 'server-only';
import { Prisma, type JobStatus } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';

export type EnqueueInput<P = unknown> = {
  type: string;
  payload: P;
  organizationId?: string | null;
  /** Chave de deduplicação. Se já existir job com mesmo (type, dedupKey) e status != succeeded/failed/dead, ignora. */
  dedupKey?: string | null;
  /** Atraso em segundos (default 0). */
  delaySeconds?: number;
  priority?: number;
  maxAttempts?: number;
};

export type EnqueueResult = { id: string; status: JobStatus } | { dedup: true; existingId: string };

/**
 * Enfileira um job. Dedup: ao receber dedupKey, ignora se já existe job com mesmo
 * type+dedupKey ativo (pending/running) — evita criar duplicatas em retries de cron.
 */
export async function enqueue<P>(input: EnqueueInput<P>): Promise<EnqueueResult> {
  const runAt = new Date(Date.now() + (input.delaySeconds ?? 0) * 1000);

  // Dedup explícito antes de tentar criar — UNIQUE INDEX em (type, dedup_key) impede colisão real,
  // mas verificamos antes pra evitar Prisma error e retornar metadata.
  if (input.dedupKey) {
    const existing = await prisma.job.findFirst({
      where: { type: input.type, dedupKey: input.dedupKey },
      select: { id: true, status: true },
    });
    if (existing && (existing.status === 'pending' || existing.status === 'running' || existing.status === 'succeeded')) {
      return { dedup: true, existingId: existing.id };
    }
    if (existing && (existing.status === 'failed' || existing.status === 'dead')) {
      // Apaga o anterior pra recriar (UNIQUE INDEX exige).
      await prisma.job.delete({ where: { id: existing.id } });
    }
  }

  const job = await prisma.job.create({
    data: {
      organizationId: input.organizationId ?? null,
      type: input.type,
      dedupKey: input.dedupKey ?? null,
      payload: JSON.parse(JSON.stringify(input.payload ?? {})) as Prisma.InputJsonValue,
      priority: input.priority ?? 0,
      runAt,
      maxAttempts: input.maxAttempts ?? 5,
    },
    select: { id: true, status: true },
  });
  return job;
}
