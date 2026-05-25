import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { decryptAccessToken } from '@/src/services/whatsapp/setup';
import { normalizePhoneE164 } from '@/src/services/whatsapp/phone';
import type { TemplateComponent } from '@/src/services/whatsapp/templates';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

export type SendTemplateInput = {
  organizationId: string;
  templateId: string;
  recipientPhone: string;
  recipientName?: string;
  variables?: Record<string, string>;
  sentByUserId?: string;
  ticketId?: string;
};

export type SendTemplateResult =
  | { ok: true; sendId: string; waMessageId: string }
  | { ok: false; sendId: string; error: string };

/**
 * Envia um template aprovado.
 * - Resolve variáveis numeradas ({{1}}, {{2}}) na ordem do `variables` (chave "1", "2"...).
 * - Persiste WhatsappTemplateSend antes do call pra ter histórico mesmo se a chamada falhar.
 */
export async function sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
  const phone = normalizePhoneE164(input.recipientPhone);
  if (!phone) {
    throw new Error('Telefone inválido');
  }

  const tpl = await prisma.whatsappTemplate.findFirst({
    where: { organizationId: input.organizationId, id: input.templateId, deletedAt: null },
    select: {
      id: true,
      name: true,
      language: true,
      status: true,
      components: true,
      connectionId: true,
      connection: { select: { id: true, phoneNumberId: true } },
    },
  });
  if (!tpl) throw new Error('Template não encontrado');
  if (tpl.status !== 'approved') {
    throw new Error(`Template não aprovado pelo Meta (status atual: ${tpl.status})`);
  }

  // Cria registro local em "queued" pra ter rastro
  const send = await prisma.whatsappTemplateSend.create({
    data: {
      organizationId: input.organizationId,
      templateId: tpl.id,
      connectionId: tpl.connectionId,
      ticketId: input.ticketId,
      sentByUserId: input.sentByUserId,
      recipientPhone: phone,
      recipientName: input.recipientName,
      variables: input.variables
        ? (input.variables as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      status: 'queued',
    },
    select: { id: true },
  });

  // Monta o payload Meta
  const components = tpl.components as unknown as TemplateComponent[];
  const metaComponents = buildMetaComponents(components, input.variables ?? {});

  const token = await decryptAccessToken(tpl.connectionId);
  try {
    const res = await fetch(`${META_GRAPH_BASE}/${tpl.connection.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: tpl.language },
          components: metaComponents,
        },
      }),
    });
    const text = await res.text();
    let json: { messages?: Array<{ id: string }>; error?: { message?: string } };
    try { json = text ? JSON.parse(text) : {}; } catch { json = { error: { message: text.slice(0, 500) } }; }

    if (!res.ok || !json.messages?.[0]?.id) {
      const err = json.error?.message ?? `Meta API ${res.status}`;
      await prisma.whatsappTemplateSend.update({
        where: { id: send.id },
        data: { status: 'failed', failureReason: err.slice(0, 1000), failedAt: new Date() },
      });
      await audit({
        organizationId: input.organizationId,
        actorUserId: input.sentByUserId ?? null,
        action: 'whatsapp.template.send_failed',
        resourceType: 'whatsapp_template_send',
        resourceId: send.id,
        diff: { after: { error: err } },
      });
      return { ok: false, sendId: send.id, error: err };
    }

    const waMessageId = json.messages[0]!.id;
    await prisma.whatsappTemplateSend.update({
      where: { id: send.id },
      data: { status: 'sent', waMessageId },
    });
    await audit({
      organizationId: input.organizationId,
      actorUserId: input.sentByUserId ?? null,
      action: 'whatsapp.template.sent',
      resourceType: 'whatsapp_template_send',
      resourceId: send.id,
      diff: { after: { templateId: tpl.id, recipientPhone: phone, waMessageId } },
    });
    return { ok: true, sendId: send.id, waMessageId };
  } catch (err) {
    const message = (err as Error).message;
    await prisma.whatsappTemplateSend.update({
      where: { id: send.id },
      data: { status: 'failed', failureReason: message.slice(0, 1000), failedAt: new Date() },
    });
    return { ok: false, sendId: send.id, error: message };
  }
}

/**
 * Constrói o array `components` que o Meta espera, substituindo {{N}} com os valores fornecidos.
 * Suporta apenas variáveis em HEADER (text) e BODY por ora.
 */
function buildMetaComponents(
  components: TemplateComponent[],
  variables: Record<string, string>,
): Array<{ type: string; parameters?: Array<{ type: 'text'; text: string }> }> {
  const out: Array<{ type: string; parameters?: Array<{ type: 'text'; text: string }> }> = [];

  for (const c of components) {
    if (c.type === 'HEADER' && c.format === 'TEXT' && c.text) {
      const vars = extractVarIndices(c.text);
      if (vars.length > 0) {
        out.push({
          type: 'header',
          parameters: vars.map((i) => ({ type: 'text' as const, text: variables[String(i)] ?? '' })),
        });
      }
    } else if (c.type === 'BODY' && c.text) {
      const vars = extractVarIndices(c.text);
      if (vars.length > 0) {
        out.push({
          type: 'body',
          parameters: vars.map((i) => ({ type: 'text' as const, text: variables[String(i)] ?? '' })),
        });
      }
    }
    // FOOTER e BUTTONS sem variáveis no MVP — Meta aceita o template sem repassar.
  }

  return out;
}

function extractVarIndices(text: string): number[] {
  const matches = text.matchAll(/{{\s*(\d+)\s*}}/g);
  const indices = new Set<number>();
  for (const m of matches) indices.add(Number(m[1]));
  return Array.from(indices).sort((a, b) => a - b);
}
