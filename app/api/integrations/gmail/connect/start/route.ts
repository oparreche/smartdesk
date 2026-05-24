import { NextResponse, type NextRequest } from 'next/server';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { buildAuthUrl } from '@/src/services/gmail/oauth';
import { encodeState } from '@/src/lib/oauth-state';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');

  const state = encodeState({ organizationId: ctx.organizationId, userId: ctx.userId });

  try {
    const url = buildAuthUrl(state);
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    const message = encodeURIComponent((err as Error).message);
    return NextResponse.redirect(new URL(`/settings/gmail?error=${message}`, req.url));
  }
}

export const POST = GET;
