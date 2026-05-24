import { NextResponse, type NextRequest } from 'next/server';
import { getOrgContextOrNull } from '@/src/lib/tenant';
import { sendVerificationEmail } from '@/src/services/auth/email-verify';
import { checkRateLimit } from '@/src/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  const ctx = await getOrgContextOrNull();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await checkRateLimit({
    bucket: `resend-verify:user:${ctx.userId}`,
    windowSeconds: 5 * 60,
    max: 3,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  await sendVerificationEmail(ctx.userId);
  return NextResponse.json({ ok: true });
}
