import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { LayoutConfigSchema } from '@/src/services/layouts/schema';
import { prepareLayout } from '@/src/services/layouts/render-prepare';
import { buildTicketContext } from '@/src/services/enrichment/context';
import { prisma } from '@/src/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  ticketCode: z.string().optional(),
  config: z.unknown(),
});

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:read');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const configResult = LayoutConfigSchema.safeParse(parsed.data.config);
  if (!configResult.success) {
    return NextResponse.json({
      error: 'invalid_config',
      issues: configResult.error.issues.map((i) => ({ path: i.path, message: i.message })),
    }, { status: 400 });
  }

  let context: Record<string, unknown>;
  if (parsed.data.ticketCode) {
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: ctx.organizationId, code: parsed.data.ticketCode, deletedAt: null },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: 'ticket_not_found' }, { status: 404 });
    }
    context = await buildTicketContext(ctx.organizationId, ticket.id);
  } else {
    // Contexto vazio mas com organization minima — útil pra ver placeholders
    context = { organization: { id: ctx.organizationId, slug: ctx.organizationSlug }, now: new Date().toISOString() };
  }

  const blocks = prepareLayout(configResult.data, context, { includeHidden: true });
  return NextResponse.json({ blocks });
}
