import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrgContextOrNull } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { requirePermission } from '@/src/lib/permissions';
import { suggestReply } from '@/src/services/ai/ticket-assist';
import { AiNotConfiguredError } from '@/src/lib/gemini';
import { checkRateLimit } from '@/src/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Input = z.object({
  instruction: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const orgCtx = await getOrgContextOrNull();
  if (!orgCtx) return new NextResponse('unauthorized', { status: 401 });
  requirePermission(orgCtx.role, 'tickets:reply');

  const { code } = await ctx.params;
  const ticket = await prisma.ticket.findFirst({
    where: { organizationId: orgCtx.organizationId, code, deletedAt: null },
    select: { id: true },
  });
  if (!ticket) return new NextResponse('not_found', { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const rl = await checkRateLimit({
    bucket: `ai:reply:${orgCtx.userId}`,
    max: 30,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  try {
    const result = await suggestReply(
      orgCtx.organizationId,
      orgCtx.userId,
      ticket.id,
      parsed.data.instruction,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
