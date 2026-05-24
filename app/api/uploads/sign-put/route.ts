import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { presignPut, buildAttachmentKey } from '@/src/lib/s3';

export const runtime = 'nodejs';

const Body = z.object({
  ticketCode: z.string().min(1).max(40),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024), // 25MB
});

const ALLOWED_TYPES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/zip',
  'text/',
  'audio/',
  'video/',
];

const BLOCKED_EXTENSIONS = ['.exe', '.js', '.html', '.htm', '.bat', '.sh', '.ps1', '.com', '.scr', '.msi'];

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:reply');

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

  // Validar content-type
  if (!ALLOWED_TYPES.some((p) => parsed.data.contentType.startsWith(p))) {
    return NextResponse.json({ error: 'content_type_not_allowed' }, { status: 415 });
  }
  // Validar extensão
  const filenameLower = parsed.data.filename.toLowerCase();
  if (BLOCKED_EXTENSIONS.some((ext) => filenameLower.endsWith(ext))) {
    return NextResponse.json({ error: 'extension_blocked' }, { status: 415 });
  }

  const { prisma } = await import('@/src/lib/prisma');
  const ticket = await prisma.ticket.findFirst({
    where: { organizationId: ctx.organizationId, code: parsed.data.ticketCode, deletedAt: null },
    select: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: 'ticket_not_found' }, { status: 404 });

  const key = buildAttachmentKey(ctx.organizationId, ticket.id, parsed.data.filename);
  const url = await presignPut(key, parsed.data.contentType, 600);

  return NextResponse.json({
    key,
    uploadUrl: url,
    ticketId: ticket.id,
  });
}
