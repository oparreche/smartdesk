import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';

export type AuditEntry = {
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  diff?: { before?: unknown; after?: unknown } | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        diff: entry.diff
          ? (JSON.parse(JSON.stringify(entry.diff)) as Prisma.InputJsonValue)
          : Prisma.DbNull,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    // Auditoria não pode derrubar request — logamos e seguimos.
    logger.error({ err, entry }, 'audit.log failed');
  }
}
