import { NextResponse, type NextRequest } from 'next/server';
import { isCronAuthorized } from '@/src/lib/cron-auth';
import { pollGmailConnections } from '@/src/services/gmail/poll';
import { logger } from '@/src/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await pollGmailConnections();
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'gmail-poll failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
