import { NextResponse, type NextRequest } from 'next/server';
import { validateBearer, hasScope } from '@/src/services/api-keys';
import { prisma } from '@/src/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const auth = await validateBearer(req.headers.get('authorization'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasScope(auth.scopes, 'tickets:read')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { code } = await ctx.params;
  const ticket = await prisma.ticket.findFirst({
    where: { organizationId: auth.organizationId, code, deletedAt: null },
    select: {
      id: true,
      code: true,
      subject: true,
      description: true,
      status: true,
      priority: true,
      origin: true,
      requester: { select: { name: true, email: true, phone: true, document: true } },
      assignee: { select: { name: true, email: true } },
      queue: { select: { name: true, slug: true } },
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      closedAt: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          bodyText: true,
          createdAt: true,
        },
      },
    },
  });
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    data: {
      id: ticket.id,
      code: ticket.code,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      origin: ticket.origin,
      requester: ticket.requester,
      assignee: ticket.assignee,
      queue: ticket.queue,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
      resolved_at: ticket.resolvedAt?.toISOString() ?? null,
      closed_at: ticket.closedAt?.toISOString() ?? null,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        type: m.type,
        body: m.bodyText,
        created_at: m.createdAt.toISOString(),
      })),
    },
  });
}
