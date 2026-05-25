import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

const HEX_COLOR = /^#([0-9a-fA-F]{3}){1,2}$/;

export async function listTags(organizationId: string) {
  return prisma.tag.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      description: true,
      keywords: true,
      minKeywordMatches: true,
      autoCategorize: true,
      createdAt: true,
      _count: { select: { tickets: true } },
    },
  });
}

export async function updateTagCategorization(
  organizationId: string,
  actorUserId: string,
  tagId: string,
  input: {
    description: string | null;
    keywords: string[];
    minKeywordMatches: number;
    autoCategorize: boolean;
  },
): Promise<void> {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organizationId },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error('Tag não encontrada');

  await prisma.tag.update({
    where: { id: tagId },
    data: {
      description: input.description,
      keywords: input.keywords as Prisma.InputJsonValue,
      minKeywordMatches: Math.min(10, Math.max(1, input.minKeywordMatches)),
      autoCategorize: input.autoCategorize,
    },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'tag.categorization_updated',
    resourceType: 'tag',
    resourceId: tagId,
    diff: { after: { autoCategorize: input.autoCategorize, keywords: input.keywords.length, minKeywordMatches: input.minKeywordMatches } },
  });
}

export async function createTag(
  organizationId: string,
  actorUserId: string,
  input: { name: string; color?: string | null },
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('Nome obrigatório');

  const color = input.color?.trim() || null;
  if (color && !HEX_COLOR.test(color)) {
    throw new Error('Cor deve ser hexadecimal (#RRGGBB ou #RGB)');
  }

  try {
    const created = await prisma.tag.create({
      data: { organizationId, name, color },
      select: { id: true },
    });
    await audit({
      organizationId,
      actorUserId,
      action: 'tag.created',
      resourceType: 'tag',
      resourceId: created.id,
      diff: { after: { name, color } },
    });
    return created;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error('Já existe uma tag com esse nome');
    }
    throw err;
  }
}

export async function deleteTag(
  organizationId: string,
  actorUserId: string,
  tagId: string,
): Promise<void> {
  const existing = await prisma.tag.findFirst({
    where: { id: tagId, organizationId },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error('Tag não encontrada');

  await prisma.$transaction([
    prisma.ticketTag.deleteMany({ where: { tagId } }),
    prisma.tag.delete({ where: { id: tagId } }),
  ]);

  await audit({
    organizationId,
    actorUserId,
    action: 'tag.deleted',
    resourceType: 'tag',
    resourceId: tagId,
    diff: { before: existing },
  });
}
