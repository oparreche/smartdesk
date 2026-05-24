import 'server-only';
import { Prisma, type HttpMethod, type AuthType, type FailurePolicy } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { sealAuth, unsealAuth, summarizeAuth, type AuthConfig, type AuthSummary } from './auth';

export type IntegrationFormInput = {
  name: string;
  description?: string | null;
  enabled?: boolean;
  triggerEvents: string[];
  runOrder?: number;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string> | null;
  queryParams?: Record<string, string> | null;
  bodyTemplate?: unknown;
  auth: AuthConfig;
  timeoutMs?: number;
  maxRetries?: number;
  responseMapping: Record<string, string>;
  requiredMatchField?: string | null;
  failurePolicy?: FailurePolicy;
};

export type IntegrationView = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerEvents: string[];
  runOrder: number;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  bodyTemplate: unknown;
  authType: AuthType;
  authSummary: AuthSummary;
  timeoutMs: number;
  maxRetries: number;
  responseMapping: Record<string, string>;
  requiredMatchField: string | null;
  failurePolicy: FailurePolicy;
  createdAt: Date;
  updatedAt: Date;
};

export async function listIntegrations(organizationId: string) {
  return prisma.apiIntegration.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ enabled: 'desc' }, { runOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      enabled: true,
      method: true,
      url: true,
      authType: true,
      triggerEvents: true,
      runOrder: true,
      updatedAt: true,
      _count: { select: { runs: true } },
    },
  });
}

export async function getIntegration(
  organizationId: string,
  integrationId: string,
): Promise<IntegrationView | null> {
  const i = await prisma.apiIntegration.findFirst({
    where: { id: integrationId, organizationId, deletedAt: null },
  });
  if (!i) return null;

  const authConfig = unsealAuth(
    { ciphertext: i.authConfigEnc, nonce: i.authConfigNonce },
    i.authType,
  );

  return {
    id: i.id,
    name: i.name,
    description: i.description,
    enabled: i.enabled,
    triggerEvents: (i.triggerEvents as string[]) ?? [],
    runOrder: i.runOrder,
    method: i.method,
    url: i.url,
    headers: (i.headers as Record<string, string>) ?? {},
    queryParams: (i.queryParams as Record<string, string>) ?? {},
    bodyTemplate: i.bodyTemplate,
    authType: i.authType,
    authSummary: summarizeAuth(authConfig),
    timeoutMs: i.timeoutMs,
    maxRetries: i.maxRetries,
    responseMapping: (i.responseMapping as Record<string, string>) ?? {},
    requiredMatchField: i.requiredMatchField,
    failurePolicy: i.failurePolicy,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

export async function createIntegration(
  organizationId: string,
  actorUserId: string,
  input: IntegrationFormInput,
): Promise<{ id: string }> {
  const sealed = sealAuth(input.auth);

  const created = await prisma.apiIntegration.create({
    data: {
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      enabled: input.enabled ?? true,
      triggerEvents: input.triggerEvents as Prisma.InputJsonValue,
      runOrder: input.runOrder ?? 0,
      method: input.method,
      url: input.url.trim(),
      headers: input.headers ? (input.headers as Prisma.InputJsonValue) : Prisma.DbNull,
      queryParams: input.queryParams ? (input.queryParams as Prisma.InputJsonValue) : Prisma.DbNull,
      bodyTemplate: input.bodyTemplate
        ? (JSON.parse(JSON.stringify(input.bodyTemplate)) as Prisma.InputJsonValue)
        : Prisma.DbNull,
      authType: input.auth.type,
      authConfigEnc: sealed?.ciphertext ?? null,
      authConfigNonce: sealed?.nonce ?? null,
      timeoutMs: input.timeoutMs ?? 10000,
      maxRetries: input.maxRetries ?? 2,
      responseMapping: input.responseMapping as Prisma.InputJsonValue,
      requiredMatchField: input.requiredMatchField?.trim() || null,
      failurePolicy: input.failurePolicy ?? 'skip',
    },
    select: { id: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'integration.created',
    resourceType: 'integration',
    resourceId: created.id,
    diff: { after: { name: input.name, method: input.method, url: input.url } },
  });

  return created;
}

export async function updateIntegration(
  organizationId: string,
  actorUserId: string,
  integrationId: string,
  input: IntegrationFormInput,
  /** Quando true, mantém auth atual mesmo se input.auth.type for o mesmo (campos opcionais virgens). */
  preserveExistingSecret = false,
): Promise<void> {
  const existing = await prisma.apiIntegration.findFirst({
    where: { id: integrationId, organizationId, deletedAt: null },
    select: { id: true, authType: true, authConfigEnc: true, authConfigNonce: true, name: true },
  });
  if (!existing) throw new Error('Integração não encontrada');

  const data: Prisma.ApiIntegrationUpdateInput = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    enabled: input.enabled ?? true,
    triggerEvents: input.triggerEvents as Prisma.InputJsonValue,
    runOrder: input.runOrder ?? 0,
    method: input.method,
    url: input.url.trim(),
    headers: input.headers ? (input.headers as Prisma.InputJsonValue) : Prisma.DbNull,
    queryParams: input.queryParams ? (input.queryParams as Prisma.InputJsonValue) : Prisma.DbNull,
    bodyTemplate: input.bodyTemplate
      ? (JSON.parse(JSON.stringify(input.bodyTemplate)) as Prisma.InputJsonValue)
      : Prisma.DbNull,
    timeoutMs: input.timeoutMs ?? 10000,
    maxRetries: input.maxRetries ?? 2,
    responseMapping: input.responseMapping as Prisma.InputJsonValue,
    requiredMatchField: input.requiredMatchField?.trim() || null,
    failurePolicy: input.failurePolicy ?? 'skip',
    authType: input.auth.type,
  };

  // Decide se atualiza auth secret. Se preserveExistingSecret e o auth no input
  // não trouxer valores reais, mantém o ciphertext atual (não sobrescreve).
  const updateAuthSecret = !preserveExistingSecret || !authIsEffectivelyEmpty(input.auth);
  if (updateAuthSecret) {
    const sealed = sealAuth(input.auth);
    data.authConfigEnc = sealed?.ciphertext ?? null;
    data.authConfigNonce = sealed?.nonce ?? null;
  }

  await prisma.apiIntegration.update({ where: { id: integrationId }, data });

  await audit({
    organizationId,
    actorUserId,
    action: 'integration.updated',
    resourceType: 'integration',
    resourceId: integrationId,
    diff: { before: { name: existing.name }, after: { name: input.name } },
  });
}

function authIsEffectivelyEmpty(auth: AuthConfig): boolean {
  switch (auth.type) {
    case 'none': return true;
    case 'api_key_header': return !auth.value;
    case 'api_key_query': return !auth.value;
    case 'bearer': return !auth.token;
    case 'basic': return !auth.password && !auth.username;
    case 'custom_headers': return Object.keys(auth.headers ?? {}).length === 0;
  }
}

export async function deleteIntegration(
  organizationId: string,
  actorUserId: string,
  integrationId: string,
): Promise<void> {
  const existing = await prisma.apiIntegration.findFirst({
    where: { id: integrationId, organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) throw new Error('Integração não encontrada');

  await prisma.apiIntegration.update({
    where: { id: integrationId },
    data: { deletedAt: new Date(), enabled: false },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'integration.deleted',
    resourceType: 'integration',
    resourceId: integrationId,
    diff: { before: existing },
  });
}

export async function listRuns(organizationId: string, integrationId: string, limit = 50) {
  return prisma.apiIntegrationRun.findMany({
    where: { organizationId, integrationId },
    orderBy: { startedAt: 'desc' },
    take: Math.min(200, limit),
    select: {
      id: true,
      status: true,
      triggeredBy: true,
      requestUrl: true,
      requestMethod: true,
      responseStatus: true,
      errorMessage: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
      ticket: { select: { code: true } },
    },
  });
}
