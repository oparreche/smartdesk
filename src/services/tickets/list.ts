import 'server-only';
import { Prisma, type TicketPriority, type TicketStatus } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';

export type TicketFilters = {
  status?: TicketStatus[];
  priority?: TicketPriority[];
  queueId?: string;
  assigneeId?: string | 'me' | 'unassigned';
  tagId?: string;
  search?: string; // procura em code, subject, requester.email/name
};

export type ListOptions = {
  page?: number;
  pageSize?: number;
};

export type TicketListItem = {
  id: string;
  code: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  origin: 'gmail' | 'imap' | 'whatsapp' | 'form' | 'api' | 'manual';
  createdAt: Date;
  updatedAt: Date;
  requester: { id: string; name: string | null; email: string | null };
  assignee: { id: string; name: string; email: string } | null;
  queue: { id: string; name: string; slug: string } | null;
};

export type TicketListResult = {
  rows: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listTickets(
  organizationId: string,
  currentUserId: string | null,
  filters: TicketFilters = {},
  options: ListOptions = {},
): Promise<TicketListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));

  const where: Prisma.TicketWhereInput = {
    organizationId,
    deletedAt: null,
  };

  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.priority?.length) where.priority = { in: filters.priority };
  if (filters.queueId) where.queueId = filters.queueId;

  if (filters.assigneeId === 'unassigned') {
    where.assigneeId = null;
  } else if (filters.assigneeId === 'me' && currentUserId) {
    where.assigneeId = currentUserId;
  } else if (filters.assigneeId) {
    where.assigneeId = filters.assigneeId;
  }

  if (filters.tagId) {
    where.tags = { some: { tagId: filters.tagId } };
  }

  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      where.OR = [
        { code: { contains: term } },
        { subject: { contains: term } },
        { requester: { email: { contains: term } } },
        { requester: { name: { contains: term } } },
        { requester: { document: { contains: term.replace(/\D+/g, '') } } },
      ];
    }
  }

  const [total, rows] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        subject: true,
        status: true,
        priority: true,
        origin: true,
        createdAt: true,
        updatedAt: true,
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        queue: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
