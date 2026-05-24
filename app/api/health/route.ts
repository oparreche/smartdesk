import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Endpoint público para monitoring e load balancers. Resposta:
 *  - 200 quando DB responde
 *  - 503 caso contrário
 *
 * NÃO valida storage (S3) — checagem cara e raramente quebrada de forma silenciosa.
 * Para health check completo (DB + storage + última execução de cron), criar
 * `/api/health/deep` autenticado por CRON_SECRET (Fase 9+).
 */
export async function GET() {
  const t0 = Date.now();
  try {
    // Query trivial pra acordar pool/validar credenciais
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: 'ok',
        db: 'ok',
        uptimeSec: Math.floor(process.uptime()),
        durationMs: Date.now() - t0,
        version: process.env.APP_VERSION ?? 'dev',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        db: 'error',
        error: (err as Error).message.slice(0, 200),
        durationMs: Date.now() - t0,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
