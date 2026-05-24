import 'server-only';
import { prisma } from './prisma';

export type RateLimitConfig = {
  /** Identificador do bucket. Ex.: "form-submit:slug:ip". Máx 191 chars (índice MySQL). */
  bucket: string;
  /** Janela em segundos. */
  windowSeconds: number;
  /** Máximo de hits dentro da janela. */
  max: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Quantos hits já estão dentro da janela (incluindo o atual, se allowed). */
  count: number;
  /** Quando o bucket "libera" próximo slot. */
  retryAfterSeconds: number;
};

/**
 * Sliding-window rate limit usando a tabela `rate_limit_hits`.
 *
 * Estratégia: contar hits do bucket dentro da janela. Se count >= max → bloqueia.
 * Caso contrário, registra hit e devolve count+1.
 *
 * Limitações conhecidas (aceitáveis no MVP):
 *  - Race entre count + insert. Em volume baixo, prática aceitável. Para escala,
 *    migrar para Redis com INCR + EXPIRE.
 *  - Cleanup periódico via job (`/api/cron/cleanup`) apaga hits antigos.
 */
export async function checkRateLimit(cfg: RateLimitConfig): Promise<RateLimitResult> {
  const since = new Date(Date.now() - cfg.windowSeconds * 1000);

  const count = await prisma.rateLimitHit.count({
    where: { bucket: cfg.bucket, hitAt: { gte: since } },
  });

  if (count >= cfg.max) {
    const oldest = await prisma.rateLimitHit.findFirst({
      where: { bucket: cfg.bucket, hitAt: { gte: since } },
      orderBy: { hitAt: 'asc' },
      select: { hitAt: true },
    });
    const retryAfter = oldest
      ? Math.max(1, Math.ceil((oldest.hitAt.getTime() + cfg.windowSeconds * 1000 - Date.now()) / 1000))
      : cfg.windowSeconds;
    return { allowed: false, count, retryAfterSeconds: retryAfter };
  }

  await prisma.rateLimitHit.create({
    data: { bucket: cfg.bucket.slice(0, 191) },
  });

  return { allowed: true, count: count + 1, retryAfterSeconds: 0 };
}

/**
 * Apaga hits antigos. Chamado por `/api/cron/cleanup`.
 */
export async function pruneRateLimitHits(olderThanHours = 1): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const result = await prisma.rateLimitHit.deleteMany({
    where: { hitAt: { lt: cutoff } },
  });
  return result.count;
}
