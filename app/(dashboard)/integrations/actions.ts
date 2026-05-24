'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createIntegration, updateIntegration, deleteIntegration, type IntegrationFormInput } from '@/src/services/integrations/crud';
import { enqueue } from '@/src/services/jobs/enqueue';
import type { AuthConfig } from '@/src/services/integrations/auth';

const TRIGGERS = ['ticket.created', 'form.submitted', 'manual.run'] as const;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

const FormSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  enabled: z.coerce.boolean().optional(),
  triggerEvents: z.array(z.enum(TRIGGERS)).default([]),
  runOrder: z.coerce.number().int().min(0).max(1000).default(0),
  method: z.enum(METHODS),
  url: z.string().min(1).startsWith('http'),
  headersJson: z.string().optional(),
  queryParamsJson: z.string().optional(),
  bodyJson: z.string().optional(),
  authType: z.enum(['none', 'api_key_header', 'api_key_query', 'bearer', 'basic', 'custom_headers']),
  authHeaderName: z.string().optional(),
  authParamName: z.string().optional(),
  authValue: z.string().optional(),
  authToken: z.string().optional(),
  authUsername: z.string().optional(),
  authPassword: z.string().optional(),
  authCustomHeaders: z.string().optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(30000).default(10000),
  maxRetries: z.coerce.number().int().min(0).max(5).default(2),
  responseMappingJson: z.string().min(2),
  requiredMatchField: z.string().max(200).optional(),
  failurePolicy: z.enum(['skip', 'retry_later', 'flag_ticket']).default('skip'),
});

function parseFormToInput(form: FormData): IntegrationFormInput {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k === 'triggerEvents') {
      obj[k] = form.getAll(k);
    } else {
      obj[k] = v;
    }
  }
  // Default vazio para multi-select sem nenhuma marcada
  if (!Array.isArray(obj.triggerEvents)) obj.triggerEvents = [];
  if (!obj.enabled) obj.enabled = 'false';

  const parsed = FormSchema.parse(obj);

  const headers = parseJsonObject(parsed.headersJson, 'headers');
  const queryParams = parseJsonObject(parsed.queryParamsJson, 'queryParams');
  const bodyTemplate = parsed.bodyJson?.trim() ? safeParseJson(parsed.bodyJson, 'body') : null;
  const responseMapping = parseJsonObject(parsed.responseMappingJson, 'responseMapping') ?? {};

  const auth = buildAuthFromForm({
    type: parsed.authType,
    headerName: parsed.authHeaderName ?? '',
    paramName: parsed.authParamName ?? '',
    value: parsed.authValue ?? '',
    token: parsed.authToken ?? '',
    username: parsed.authUsername ?? '',
    password: parsed.authPassword ?? '',
    customHeadersJson: parsed.authCustomHeaders ?? '',
  });

  return {
    name: parsed.name,
    description: parsed.description ?? null,
    enabled: parsed.enabled,
    triggerEvents: parsed.triggerEvents,
    runOrder: parsed.runOrder,
    method: parsed.method,
    url: parsed.url,
    headers,
    queryParams,
    bodyTemplate,
    auth,
    timeoutMs: parsed.timeoutMs,
    maxRetries: parsed.maxRetries,
    responseMapping: responseMapping as Record<string, string>,
    requiredMatchField: parsed.requiredMatchField || null,
    failurePolicy: parsed.failurePolicy,
  };
}

function buildAuthFromForm(input: {
  type: string;
  headerName: string;
  paramName: string;
  value: string;
  token: string;
  username: string;
  password: string;
  customHeadersJson: string;
}): AuthConfig {
  switch (input.type) {
    case 'api_key_header':
      return { type: 'api_key_header', headerName: input.headerName, value: input.value };
    case 'api_key_query':
      return { type: 'api_key_query', paramName: input.paramName, value: input.value };
    case 'bearer':
      return { type: 'bearer', token: input.token };
    case 'basic':
      return { type: 'basic', username: input.username, password: input.password };
    case 'custom_headers': {
      const headers = parseJsonObject(input.customHeadersJson, 'authCustomHeaders') ?? {};
      return { type: 'custom_headers', headers: headers as Record<string, string> };
    }
    default:
      return { type: 'none' };
  }
}

function parseJsonObject(text: string | undefined, field: string): Record<string, string> | null {
  if (!text || !text.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${field}: JSON inválido (${(err as Error).message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${field}: deve ser objeto JSON`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function safeParseJson(text: string, field: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${field}: JSON inválido (${(err as Error).message})`);
  }
}

export type FormState = { ok: true; id: string } | { ok: false; error: string };

export async function createIntegrationAction(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:write');

  let input: IntegrationFormInput;
  try {
    input = parseFormToInput(form);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  try {
    const created = await createIntegration(ctx.organizationId, ctx.userId, input);
    revalidatePath('/integrations');
    redirect(`/integrations/${created.id}`);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateIntegrationAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:write');

  const id = String(form.get('id') ?? '');
  if (!id) return;

  const input = parseFormToInput(form);
  // preserveExistingSecret: se admin não preencheu campos sensíveis, mantém o secret atual
  await updateIntegration(ctx.organizationId, ctx.userId, id, input, true);
  revalidatePath(`/integrations/${id}`);
  revalidatePath('/integrations');
}

export async function deleteIntegrationAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:write');

  const id = String(form.get('id') ?? '');
  if (!id) return;
  await deleteIntegration(ctx.organizationId, ctx.userId, id);
  revalidatePath('/integrations');
  redirect('/integrations');
}

const ManualRunInput = z.object({
  integrationId: z.string().uuid(),
  ticketCode: z.string().optional(),
});

export async function manualRunAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:run');

  const parsed = ManualRunInput.safeParse({
    integrationId: form.get('integrationId'),
    ticketCode: form.get('ticketCode') || undefined,
  });
  if (!parsed.success) return;

  let ticketId: string | null = null;
  if (parsed.data.ticketCode) {
    const { prisma } = await import('@/src/lib/prisma');
    const t = await prisma.ticket.findFirst({
      where: { organizationId: ctx.organizationId, code: parsed.data.ticketCode, deletedAt: null },
      select: { id: true },
    });
    ticketId = t?.id ?? null;
    if (!ticketId) throw new Error(`Ticket ${parsed.data.ticketCode} não encontrado`);
  }

  await enqueue({
    type: 'integration.run',
    payload: {
      organizationId: ctx.organizationId,
      integrationId: parsed.data.integrationId,
      ticketId,
      triggeredBy: 'manual.run',
    },
    organizationId: ctx.organizationId,
    maxAttempts: 1,
  });

  revalidatePath(`/integrations/${parsed.data.integrationId}/runs`);
  if (parsed.data.ticketCode) revalidatePath(`/tickets/${parsed.data.ticketCode}`);
}
