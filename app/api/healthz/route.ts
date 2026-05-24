import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: { ok: true, ms: Date.now() - start },
      uptime: Math.round(process.uptime()),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: { ok: false, error: (err as Error).message.slice(0, 120) },
      },
      { status: 503 },
    );
  }
}
