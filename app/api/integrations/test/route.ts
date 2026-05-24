import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { runIntegration } from '@/src/services/integrations/run';
import { prisma } from '@/src/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  integrationId: z.string().uuid(),
  ticketCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:run');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  let ticketId: string | null = null;
  if (parsed.data.ticketCode) {
    const t = await prisma.ticket.findFirst({
      where: { organizationId: ctx.organizationId, code: parsed.data.ticketCode, deletedAt: null },
      select: { id: true },
    });
    if (!t) {
      return NextResponse.json({ error: 'ticket_not_found' }, { status: 404 });
    }
    ticketId = t.id;
  }

  try {
    const result = await runIntegration({
      organizationId: ctx.organizationId,
      integrationId: parsed.data.integrationId,
      ticketId,
      triggeredBy: 'manual.test',
      triggeredByUser: ctx.userId,
      dryRun: true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: 'failed', message: (err as Error).message }, { status: 500 });
  }
}
