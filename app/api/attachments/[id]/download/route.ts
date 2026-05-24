import { NextResponse, type NextRequest } from 'next/server';
import { getOrgContext } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { presignGet } from '@/src/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const orgCtx = await getOrgContext();
  const { id } = await ctx.params;

  const attachment = await prisma.ticketAttachment.findFirst({
    where: { id, organizationId: orgCtx.organizationId },
    select: { storageKey: true, filename: true },
  });
  if (!attachment) return new NextResponse('not_found', { status: 404 });

  const url = await presignGet(attachment.storageKey, 900);
  return NextResponse.redirect(url, { status: 302 });
}
