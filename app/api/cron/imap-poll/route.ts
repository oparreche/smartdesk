import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/src/lib/cron-auth';
import { pollAllConnections } from '@/src/services/imap/poll';
import { logger } from '@/src/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await pollAllConnections();
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'imap-poll failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
