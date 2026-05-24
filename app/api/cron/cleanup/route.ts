import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/src/lib/cron-auth';
import { rescueStaleJobs, purgeOldJobs } from '@/src/services/jobs/claim';
import { pruneRateLimitHits } from '@/src/lib/rate-limit';
import { logger } from '@/src/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const [rescued, purged, rl] = await Promise.all([
      rescueStaleJobs(),
      purgeOldJobs(),
      pruneRateLimitHits(1),
    ]);
    return NextResponse.json({ rescued, purged, rateLimitPruned: rl });
  } catch (err) {
    logger.error({ err }, 'cleanup failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
