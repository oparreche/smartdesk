import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export type ApiScope =
  | 'tickets:read'
  | 'tickets:write'
  | 'requesters:read'
  | 'requesters:write'
  | 'tags:read'
  | 'queues:read';

export const ALL_SCOPES: ApiScope[] = [
  'tickets:read',
  'tickets:write',
  'requesters:read',
  'requesters:write',
  'tags:read',
  'queues:read',
];

const PER_ORG_LIMIT = 20;

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export type CreateApiKeyInput = {
  name: string;
  scopes: ApiScope[];
  expiresInDays?: number;
};

export async function listKeys(organizationId: string) {
  return prisma.apiKey.findMany({
    where: { organizationId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      enabled: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });
}

export async function createKey(
  organizationId: string,
  actorUserId: string,
  input: CreateApiKeyInput,
): Promise<{ id: string; rawKey: string; prefix: string }> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('Nome obrigatório');
  const scopes = input.scopes.filter((s) => (ALL_SCOPES as string[]).includes(s));
  if (scopes.length === 0) throw new Error('Pelo menos 1 scope obrigatório');

  const total = await prisma.apiKey.count({
    where: { organizationId, revokedAt: null },
  });
  if (total >= PER_ORG_LIMIT) throw new Error(`Limite de ${PER_ORG_LIMIT} API keys`);

  const rawKey = `sk_${randomBytes(32).toString('base64url')}`;
  const hashed = hashKey(rawKey);
  const prefix = `...${rawKey.slice(-8)}`;
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000)
    : null;

  const created = await prisma.apiKey.create({
    data: {
      organizationId,
      name,
      hashedKey: hashed,
      prefix,
      scopes: scopes as unknown as object,
      expiresAt,
      createdById: actorUserId,
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'apikey.create',
    resourceType: 'api_key',
    resourceId: created.id,
    diff: { after: { name, scopes, expiresAt: expiresAt?.toISOString() ?? null } },
  });

  return { id: created.id, rawKey, prefix };
}

export async function revokeKey(
  organizationId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  const k = await prisma.apiKey.findFirst({
    where: { id, organizationId, revokedAt: null },
    select: { id: true, name: true },
  });
  if (!k) return;
  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date(), enabled: false },
  });
  await audit({
    organizationId,
    actorUserId,
    action: 'apikey.revoke',
    resourceType: 'api_key',
    resourceId: id,
    diff: { before: { name: k.name } },
  });
}

/**
 * Valida um Bearer token. Retorna org + scopes ou null se inválido.
 */
export type ValidatedKey = {
  apiKeyId: string;
  organizationId: string;
  scopes: ApiScope[];
};

export async function validateBearer(rawAuth: string | null): Promise<ValidatedKey | null> {
  if (!rawAuth) return null;
  const m = rawAuth.match(/^Bearer\s+(sk_[A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const rawKey = m[1];
  const hashed = hashKey(rawKey);

  const k = await prisma.apiKey.findFirst({
    where: { hashedKey: hashed, enabled: true, revokedAt: null },
    select: {
      id: true,
      organizationId: true,
      scopes: true,
      expiresAt: true,
    },
  });
  if (!k) return null;
  if (k.expiresAt && k.expiresAt < new Date()) return null;

  // Bump lastUsedAt (best-effort)
  prisma.apiKey
    .update({ where: { id: k.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const scopes = Array.isArray(k.scopes) ? (k.scopes as string[]) : [];
  return {
    apiKeyId: k.id,
    organizationId: k.organizationId,
    scopes: scopes.filter((s): s is ApiScope =>
      (ALL_SCOPES as string[]).includes(s),
    ),
  };
}

export function hasScope(scopes: ApiScope[], required: ApiScope): boolean {
  return scopes.includes(required);
}
