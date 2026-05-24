import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export type SavedFilterParams = Record<string, string | string[]>;

const NAME_MAX = 120;
const RESOURCE_MAX = 40;
const PER_USER_LIMIT = 30;
const PARAM_KEYS_MAX = 30;

function sanitizeParams(raw: unknown): SavedFilterParams {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, PARAM_KEYS_MAX);
  const out: SavedFilterParams = {};
  for (const [k, v] of entries) {
    if (typeof k !== 'string' || k.length > 60) continue;
    if (k === 'page') continue;
    if (Array.isArray(v)) {
      const arr = v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.slice(0, 200))
        .slice(0, 30);
      if (arr.length) out[k] = arr;
    } else if (typeof v === 'string' && v.length > 0) {
      out[k] = v.slice(0, 200);
    }
  }
  return out;
}

export async function listSavedFilters(
  organizationId: string,
  userId: string,
  resource: string,
) {
  return prisma.savedFilter.findMany({
    where: {
      organizationId,
      resource,
      deletedAt: null,
      OR: [{ userId }, { userId: null }],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      params: true,
      userId: true,
      createdAt: true,
    },
  });
}

export async function createSavedFilter(
  organizationId: string,
  userId: string,
  input: { name: string; resource: string; params: unknown; shared?: boolean },
): Promise<{ id: string }> {
  const name = input.name.trim().slice(0, NAME_MAX);
  if (!name) throw new Error('Nome obrigatório');
  const resource = input.resource.slice(0, RESOURCE_MAX);
  if (!resource) throw new Error('Recurso obrigatório');

  const count = await prisma.savedFilter.count({
    where: { organizationId, userId, deletedAt: null },
  });
  if (count >= PER_USER_LIMIT) throw new Error('Limite de filtros salvos atingido');

  const params = sanitizeParams(input.params);
  const created = await prisma.savedFilter.create({
    data: {
      organizationId,
      userId: input.shared ? null : userId,
      resource,
      name,
      params,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId: userId,
    action: 'saved_filter.create',
    resourceType: 'saved_filter',
    resourceId: created.id,
    diff: { after: { name, resource, shared: !!input.shared } },
  });

  return created;
}

export async function deleteSavedFilter(
  organizationId: string,
  userId: string,
  id: string,
): Promise<void> {
  const existing = await prisma.savedFilter.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, userId: true, name: true },
  });
  if (!existing) return;
  // Só o dono pode deletar o próprio; compartilhados (userId null) qualquer membro com permissão pode (controlado na action)
  if (existing.userId && existing.userId !== userId) {
    throw new Error('Sem permissão para excluir filtro de outro usuário');
  }

  await prisma.savedFilter.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await audit({
    organizationId,
    actorUserId: userId,
    action: 'saved_filter.delete',
    resourceType: 'saved_filter',
    resourceId: id,
    diff: { before: { name: existing.name } },
  });
}
