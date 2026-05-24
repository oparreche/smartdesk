import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function listQueues(organizationId: string) {
  return prisma.queue.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isDefault: true,
      createdAt: true,
      _count: { select: { tickets: true } },
    },
  });
}

export async function createQueue(
  organizationId: string,
  actorUserId: string,
  input: { name: string; description?: string; isDefault?: boolean },
): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('Nome obrigatório');

  let slug = slugify(name);
  if (!slug) throw new Error('Nome inválido');

  // Garantir unicidade do slug por org
  const existing = await prisma.queue.findFirst({
    where: { organizationId, slug, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const created = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.queue.updateMany({
        where: { organizationId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }
    return tx.queue.create({
      data: {
        organizationId,
        name,
        slug,
        description: input.description?.trim() || null,
        isDefault: Boolean(input.isDefault),
      },
      select: { id: true, slug: true },
    });
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'queue.created',
    resourceType: 'queue',
    resourceId: created.id,
    diff: { after: { name, slug: created.slug } },
  });

  return created;
}

export async function updateQueue(
  organizationId: string,
  actorUserId: string,
  queueId: string,
  input: { name?: string; description?: string | null; isDefault?: boolean },
): Promise<void> {
  const existing = await prisma.queue.findFirst({
    where: { id: queueId, organizationId, deletedAt: null },
    select: { id: true, name: true, description: true, isDefault: true },
  });
  if (!existing) throw new Error('Fila não encontrada');

  const data: { name?: string; description?: string | null; isDefault?: boolean } = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('Nome obrigatório');
    data.name = n;
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.isDefault !== undefined) data.isDefault = input.isDefault;

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.queue.updateMany({
        where: { organizationId, isDefault: true, NOT: { id: queueId }, deletedAt: null },
        data: { isDefault: false },
      });
    }
    await tx.queue.update({ where: { id: queueId }, data });
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'queue.updated',
    resourceType: 'queue',
    resourceId: queueId,
    diff: { before: existing, after: data },
  });
}

export async function deleteQueue(
  organizationId: string,
  actorUserId: string,
  queueId: string,
): Promise<void> {
  const existing = await prisma.queue.findFirst({
    where: { id: queueId, organizationId, deletedAt: null },
    select: { id: true, name: true, isDefault: true },
  });
  if (!existing) throw new Error('Fila não encontrada');
  if (existing.isDefault) {
    throw new Error('Não é possível excluir a fila padrão. Defina outra como padrão antes.');
  }

  await prisma.queue.update({
    where: { id: queueId },
    data: { deletedAt: new Date() },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'queue.deleted',
    resourceType: 'queue',
    resourceId: queueId,
    diff: { before: existing },
  });
}
