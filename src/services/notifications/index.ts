import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';

export type NotificationKind = 'mention' | 'assigned' | 'reply' | 'sla_breach';

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  resourceType: string | null;
  resourceId: string | null;
  actorUserId: string | null;
  actor: { name: string } | null;
  readAt: Date | null;
  createdAt: Date;
};

const TITLE_MAX = 200;
const BODY_MAX = 1000;
const LINK_MAX = 500;

export async function createNotification(input: {
  organizationId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, TITLE_MAX),
        body: input.body?.slice(0, BODY_MAX) ?? null,
        link: input.link?.slice(0, LINK_MAX) ?? null,
        actorUserId: input.actorUserId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, input }, 'notification.create failed');
  }
}

export async function listUserNotifications(
  organizationId: string,
  userId: string,
  limit = 20,
): Promise<{
  items: NotificationItem[];
  unreadCount: number;
}> {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        link: true,
        resourceType: true,
        resourceId: true,
        actorUserId: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { organizationId, userId, readAt: null },
    }),
  ]);

  // Resolve actor names em batch
  const actorIds = Array.from(new Set(items.map((i) => i.actorUserId).filter(Boolean) as string[]));
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, { name: a.name }]));

  return {
    items: items.map((i) => ({
      ...i,
      kind: i.kind as NotificationKind,
      actor: i.actorUserId ? actorMap.get(i.actorUserId) ?? null : null,
    })),
    unreadCount,
  };
}

export async function markAsRead(
  organizationId: string,
  userId: string,
  id: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, organizationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(
  organizationId: string,
  userId: string,
): Promise<{ count: number }> {
  const r = await prisma.notification.updateMany({
    where: { organizationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count: r.count };
}

/**
 * Detecta @menções no texto. Formatos aceitos:
 *  - @user@empresa.com (email completo)
 *  - @user.name (nome de usuário simples — matched contra email local-part)
 *
 * Retorna lista de userIds encontrados (deduplicados) da org.
 */
export async function detectMentionedUsers(
  organizationId: string,
  text: string,
): Promise<Array<{ id: string; email: string; name: string }>> {
  const matches = new Set<string>();
  // Captura @email ou @handle simples
  const re = /@([a-zA-Z0-9._%+-]+(?:@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    matches.add(m[1].toLowerCase());
  }
  if (matches.size === 0) return [];

  const candidates = Array.from(matches);

  // Busca emails exatos primeiro
  const emailMatches = candidates.filter((c) => c.includes('@'));
  const handleMatches = candidates.filter((c) => !c.includes('@'));

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      memberships: {
        some: {
          organizationId,
          status: 'active',
        },
      },
      OR: [
        ...(emailMatches.length ? [{ email: { in: emailMatches } }] : []),
        ...(handleMatches.length
          ? [
              {
                email: {
                  in: handleMatches.flatMap((h) => [
                    `${h}@`, // só pra forçar o startsWith abaixo
                  ]),
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true, email: true, name: true },
  });

  // Filtra handle matches pelo prefixo local-part
  const result = new Map<string, { id: string; email: string; name: string }>();
  for (const u of users) {
    result.set(u.id, u);
  }

  if (handleMatches.length > 0) {
    const allUsers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        memberships: {
          some: { organizationId, status: 'active' },
        },
      },
      select: { id: true, email: true, name: true },
    });
    for (const u of allUsers) {
      const local = u.email.split('@')[0].toLowerCase();
      if (handleMatches.includes(local)) result.set(u.id, u);
    }
  }

  return Array.from(result.values());
}
