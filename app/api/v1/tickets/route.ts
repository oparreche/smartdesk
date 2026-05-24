import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBearer, hasScope } from '@/src/services/api-keys';
import { listTickets } from '@/src/services/tickets/list';
import { createTicket } from '@/src/services/tickets/create';
import { checkRateLimit } from '@/src/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authOrFail(req: NextRequest, scope: 'tickets:read' | 'tickets:write') {
  const auth = await validateBearer(req.headers.get('authorization'));
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }
  if (!hasScope(auth.scopes, scope)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'forbidden', required_scope: scope },
        { status: 403 },
      ),
    };
  }

  const rl = await checkRateLimit({
    bucket: `api:${auth.apiKeyId}`,
    max: 120,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'rate_limited', retry_after_seconds: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      ),
    };
  }

  return { ok: true as const, auth };
}

export async function GET(req: NextRequest) {
  const a = await authOrFail(req, 'tickets:read');
  if (!a.ok) return a.response;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('page_size') ?? 25)));

  const result = await listTickets(
    a.auth.organizationId,
    null,
    {
      status: sp.get('status')?.split(',').filter(Boolean) as 'new'[] | undefined,
      search: sp.get('q') ?? undefined,
    },
    { page, pageSize },
  );

  return NextResponse.json({
    data: result.rows.map((t) => ({
      id: t.id,
      code: t.code,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      origin: t.origin,
      requester: t.requester,
      assignee: t.assignee,
      queue: t.queue,
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
    })),
    meta: {
      page: result.page,
      page_size: pageSize,
      total: result.total,
      total_pages: result.totalPages,
    },
  });
}

const CreateBody = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent', 'critical']).optional(),
  requester: z.object({
    email: z.string().email().optional(),
    name: z.string().max(120).optional(),
    document: z.string().max(20).optional(),
    phone: z.string().max(32).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const a = await authOrFail(req, 'tickets:write');
  if (!a.ok) return a.response;

  const body = await req.json().catch(() => ({}));
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!parsed.data.requester.email && !parsed.data.requester.document && !parsed.data.requester.phone) {
    return NextResponse.json(
      { error: 'requester_needs_identifier' },
      { status: 400 },
    );
  }

  const ticket = await createTicket(a.auth.organizationId, null, {
    subject: parsed.data.subject,
    description: parsed.data.description ?? null,
    origin: 'api',
    priority: parsed.data.priority ?? 'normal',
    status: 'new',
    requester: {
      email: parsed.data.requester.email ?? null,
      name: parsed.data.requester.name ?? null,
      document: parsed.data.requester.document ?? null,
      phone: parsed.data.requester.phone ?? null,
    },
  });

  return NextResponse.json(
    {
      data: {
        id: ticket.id,
        code: ticket.code,
      },
    },
    { status: 201 },
  );
}
