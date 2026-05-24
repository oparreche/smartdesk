import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';

export type AuditFilters = {
  action?: string;
  resourceType?: string;
  actorUserId?: string;
  since?: Date;
};

export async function listAudit(
  organizationId: string,
  filters: AuditFilters = {},
  options: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, options.pageSize ?? 50);

  const where: Prisma.AuditLogWhereInput = { organizationId };
  if (filters.action) where.action = { contains: filters.action };
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.since) where.createdAt = { gte: filters.since };

  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Resolve nomes de actor user em batch
  const userIds = Array.from(
    new Set(rows.map((r) => r.actorUserId).filter((u): u is string => !!u)),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const usersMap = new Map(users.map((u) => [u.id, u]));

  return {
    rows: rows.map((r) => ({
      ...r,
      actor: r.actorUserId ? usersMap.get(r.actorUserId) ?? null : null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listDistinctActions(organizationId: string): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    where: { organizationId },
    distinct: ['action'],
    select: { action: true },
    take: 200,
  });
  return rows.map((r) => r.action).sort();
}
