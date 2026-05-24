import { NextResponse, type NextRequest } from 'next/server';
import { tickOnce } from '@/src/services/jobs/runner';
import { isCronAuthorized } from '@/src/lib/cron-auth';
import { logger } from '@/src/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const batchSize = Math.max(1, Math.min(100, Number(url.searchParams.get('batch') ?? 20)));

  try {
    const result = await tickOnce(batchSize);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'jobs-tick failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
