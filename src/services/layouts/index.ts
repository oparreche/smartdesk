import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { LayoutConfigSchema, type LayoutConfig } from './schema';

export async function listLayouts(organizationId: string) {
  return prisma.ticketLayout.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getLayout(organizationId: string, layoutId: string) {
  return prisma.ticketLayout.findFirst({
    where: { id: layoutId, organizationId, deletedAt: null },
  });
}

export async function getDefaultLayout(organizationId: string) {
  return prisma.ticketLayout.findFirst({
    where: { organizationId, isDefault: true, deletedAt: null },
  });
}

export async function createLayout(
  organizationId: string,
  actorUserId: string,
  input: { name: string; config: LayoutConfig; isDefault?: boolean },
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('Nome obrigatório');

  // Validar config
  LayoutConfigSchema.parse(input.config);

  const created = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.ticketLayout.updateMany({
        where: { organizationId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }
    return tx.ticketLayout.create({
      data: {
        organizationId,
        name,
        scope: 'organization',
        isDefault: Boolean(input.isDefault),
        createdById: actorUserId,
        config: input.config as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'layout.created',
    resourceType: 'layout',
    resourceId: created.id,
    diff: { after: { name, blockCount: input.config.blocks.length } },
  });

  return created;
}

export async function updateLayoutConfig(
  organizationId: string,
  actorUserId: string,
  layoutId: string,
  input: { name?: string; config?: LayoutConfig; isDefault?: boolean },
): Promise<void> {
  const existing = await prisma.ticketLayout.findFirst({
    where: { id: layoutId, organizationId, deletedAt: null },
    select: { id: true, name: true, isDefault: true, version: true },
  });
  if (!existing) throw new Error('Layout não encontrado');

  const data: Prisma.TicketLayoutUpdateInput = {};

  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('Nome obrigatório');
    data.name = n;
  }
  if (input.config !== undefined) {
    LayoutConfigSchema.parse(input.config);
    data.config = input.config as unknown as Prisma.InputJsonValue;
    data.version = existing.version + 1;
  }
  if (input.isDefault !== undefined) {
    data.isDefault = input.isDefault;
  }

  await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.ticketLayout.updateMany({
        where: { organizationId, isDefault: true, NOT: { id: layoutId }, deletedAt: null },
        data: { isDefault: false },
      });
    }
    await tx.ticketLayout.update({ where: { id: layoutId }, data });
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'layout.updated',
    resourceType: 'layout',
    resourceId: layoutId,
    diff: { before: existing, after: { name: input.name, isDefault: input.isDefault } },
  });
}

export async function deleteLayout(
  organizationId: string,
  actorUserId: string,
  layoutId: string,
): Promise<void> {
  const existing = await prisma.ticketLayout.findFirst({
    where: { id: layoutId, organizationId, deletedAt: null },
    select: { id: true, name: true, isDefault: true },
  });
  if (!existing) throw new Error('Layout não encontrado');
  if (existing.isDefault) {
    throw new Error('Não é possível excluir o layout padrão. Defina outro como padrão antes.');
  }

  await prisma.ticketLayout.update({
    where: { id: layoutId },
    data: { deletedAt: new Date() },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'layout.deleted',
    resourceType: 'layout',
    resourceId: layoutId,
    diff: { before: existing },
  });
}
