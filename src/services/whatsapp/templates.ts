import 'server-only';
import { Prisma, type WaTemplateCategory, type WaTemplateStatus } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { audit } from '@/src/services/audit/log';
import { decryptAccessToken } from '@/src/services/whatsapp/setup';

// Tipos do payload Meta
type MetaComponentParam = { type: string; text: string };
export type TemplateComponent =
  | { type: 'HEADER'; format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string; example?: { header_text?: string[] } }
  | { type: 'BODY'; text: string; example?: { body_text?: string[][] } }
  | { type: 'FOOTER'; text: string }
  | { type: 'BUTTONS'; buttons: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }> };

export type CreateTemplateInput = {
  organizationId: string;
  actorUserId: string;
  connectionId: string;
  name: string;             // só [a-z0-9_], 64 chars
  language: string;         // ex: pt_BR
  category: WaTemplateCategory;
  components: TemplateComponent[];
  variablesSchema?: Record<string, { label: string; example?: string; hint?: string }>;
};

export class WaTemplateError extends Error {
  constructor(message: string, public code: 'connection_not_found' | 'meta_error' | 'duplicate' | 'invalid') {
    super(message);
    this.name = 'WaTemplateError';
  }
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 64);
}

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

async function callMeta<T>(opts: {
  url: string;
  method?: 'GET' | 'POST' | 'DELETE';
  token: string;
  body?: unknown;
}): Promise<T> {
  const res = await fetch(opts.url, {
    method: opts.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number } }).error;
    throw new WaTemplateError(
      err?.message ?? `Meta API ${res.status}: ${text.slice(0, 200)}`,
      'meta_error',
    );
  }
  return json as T;
}

/** Cria localmente (draft) e submete ao Meta. Idempotente por (connection, name, language). */
export async function createTemplate(input: CreateTemplateInput) {
  const name = normalizeName(input.name);
  if (!name) throw new WaTemplateError('Nome inválido', 'invalid');

  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: input.connectionId, organizationId: input.organizationId, deletedAt: null },
    select: { id: true, businessAccountId: true },
  });
  if (!conn) throw new WaTemplateError('Conexão não encontrada', 'connection_not_found');

  const existing = await prisma.whatsappTemplate.findFirst({
    where: {
      connectionId: conn.id,
      name,
      language: input.language,
      deletedAt: null,
    },
    select: { id: true, status: true },
  });
  if (existing) throw new WaTemplateError('Template já existe (mesmo nome + idioma)', 'duplicate');

  // 1) cria local como pending (vamos submeter ao Meta na sequência)
  const tpl = await prisma.whatsappTemplate.create({
    data: {
      organizationId: input.organizationId,
      connectionId: conn.id,
      name,
      language: input.language,
      category: input.category,
      components: input.components as unknown as Prisma.InputJsonValue,
      variablesSchema: input.variablesSchema
        ? (input.variablesSchema as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      createdByUserId: input.actorUserId,
      status: 'pending',
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  // 2) submete pro Meta
  const token = await decryptAccessToken(conn.id);
  try {
    const resp = await callMeta<{ id: string; status: string; category?: string }>({
      url: `${META_GRAPH_BASE}/${conn.businessAccountId}/message_templates`,
      method: 'POST',
      token,
      body: {
        name,
        language: input.language,
        category: input.category.toUpperCase(),
        components: input.components,
      },
    });
    await prisma.whatsappTemplate.update({
      where: { id: tpl.id },
      data: {
        metaTemplateId: resp.id,
        status: mapMetaStatus(resp.status),
      },
    });
  } catch (err) {
    // mantém local como draft + grava o erro pra usuário re-tentar
    await prisma.whatsappTemplate.update({
      where: { id: tpl.id },
      data: {
        status: 'draft',
        rejectionReason: (err as Error).message.slice(0, 1000),
        submittedAt: null,
      },
    });
    throw err;
  }

  await audit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'whatsapp.template.created',
    resourceType: 'whatsapp_template',
    resourceId: tpl.id,
    diff: { after: { name, language: input.language, category: input.category } },
  });

  return { id: tpl.id };
}

export async function listTemplates(organizationId: string) {
  return prisma.whatsappTemplate.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      language: true,
      category: true,
      status: true,
      rejectionReason: true,
      metaTemplateId: true,
      submittedAt: true,
      approvedAt: true,
      createdAt: true,
      components: true,
      connection: {
        select: { id: true, displayPhoneNumber: true, businessAccountId: true },
      },
      _count: { select: { sends: true } },
    },
  });
}

export async function getTemplate(organizationId: string, id: string) {
  return prisma.whatsappTemplate.findFirst({
    where: { organizationId, id, deletedAt: null },
    include: {
      connection: {
        select: { id: true, displayPhoneNumber: true, businessAccountId: true },
      },
      _count: { select: { sends: true } },
    },
  });
}

/** Refaz a leitura do Meta e atualiza status/rejectionReason no DB. */
export async function syncTemplate(organizationId: string, templateId: string): Promise<void> {
  const tpl = await prisma.whatsappTemplate.findFirst({
    where: { organizationId, id: templateId, deletedAt: null },
    select: { id: true, metaTemplateId: true, connectionId: true, status: true },
  });
  if (!tpl || !tpl.metaTemplateId) return;

  const token = await decryptAccessToken(tpl.connectionId);
  try {
    type MetaTpl = { status: string; rejected_reason?: string; category?: string };
    const data = await callMeta<MetaTpl>({
      url: `${META_GRAPH_BASE}/${tpl.metaTemplateId}?fields=status,rejected_reason,category`,
      method: 'GET',
      token,
    });
    const mapped = mapMetaStatus(data.status);
    await prisma.whatsappTemplate.update({
      where: { id: tpl.id },
      data: {
        status: mapped,
        rejectionReason: data.rejected_reason ?? null,
        approvedAt: mapped === 'approved' ? new Date() : null,
      },
    });
  } catch (err) {
    logger.warn({ err, templateId }, 'whatsapp template sync failed');
  }
}

export async function deleteTemplate(organizationId: string, actorUserId: string, templateId: string) {
  const tpl = await prisma.whatsappTemplate.findFirst({
    where: { organizationId, id: templateId, deletedAt: null },
    select: { id: true, connectionId: true, name: true, metaTemplateId: true },
  });
  if (!tpl) return;

  // soft delete local + tenta apagar no Meta (best-effort)
  if (tpl.metaTemplateId) {
    try {
      const token = await decryptAccessToken(tpl.connectionId);
      const conn = await prisma.whatsappConnection.findUnique({
        where: { id: tpl.connectionId },
        select: { businessAccountId: true },
      });
      if (conn) {
        await callMeta({
          url: `${META_GRAPH_BASE}/${conn.businessAccountId}/message_templates?name=${encodeURIComponent(tpl.name)}`,
          method: 'DELETE',
          token,
        });
      }
    } catch (err) {
      logger.warn({ err, templateId }, 'whatsapp template meta delete failed (continuing)');
    }
  }

  await prisma.whatsappTemplate.update({
    where: { id: tpl.id },
    data: { deletedAt: new Date(), status: 'disabled' },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'whatsapp.template.deleted',
    resourceType: 'whatsapp_template',
    resourceId: tpl.id,
    diff: { before: { name: tpl.name } },
  });
}

function mapMetaStatus(s: string | undefined): WaTemplateStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'PENDING':
    case 'IN_REVIEW':
      return 'pending';
    case 'PAUSED':
      return 'paused';
    case 'DISABLED':
      return 'disabled';
    default:
      return 'pending';
  }
}
