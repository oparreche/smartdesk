import { NextResponse, type NextRequest } from 'next/server';
import { handleCallback } from '@/src/services/gmail/oauth';
import { decodeState } from '@/src/lib/oauth-state';
import { logger } from '@/src/lib/logger';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    const m = encodeURIComponent(errorParam);
    return NextResponse.redirect(new URL(`/settings/gmail?error=${m}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL(`/settings/gmail?error=missing_code_or_state`, req.url));
  }

  const payload = decodeState(state);
  if (!payload) {
    return NextResponse.redirect(new URL(`/settings/gmail?error=invalid_state`, req.url));
  }

  try {
    const r = await handleCallback({
      organizationId: payload.organizationId,
      actorUserId: payload.userId,
      code,
    });
    return NextResponse.redirect(
      new URL(`/settings/gmail?connected=${encodeURIComponent(r.emailAddress)}`, req.url),
    );
  } catch (err) {
    const m = encodeURIComponent((err as Error).message);
    logger.error({ err }, 'gmail oauth callback failed');
    return NextResponse.redirect(new URL(`/settings/gmail?error=${m}`, req.url));
  }
}
