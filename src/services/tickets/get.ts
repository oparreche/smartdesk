import 'server-only';
import { prisma } from '@/src/lib/prisma';

export async function getTicketByCode(organizationId: string, code: string) {
  return prisma.ticket.findFirst({
    where: { organizationId, code, deletedAt: null },
    include: {
      requester: true,
      assignee: { select: { id: true, name: true, email: true } },
      queue: { select: { id: true, name: true, slug: true } },
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          authorUser: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
      },
      events: {
        orderBy: { createdAt: 'asc' },
      },
      enrichments: {
        where: { isCurrent: true },
        include: {
          integration: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export type TicketWithRelations = NonNullable<Awaited<ReturnType<typeof getTicketByCode>>>;
