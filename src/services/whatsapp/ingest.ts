import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { findOrCreateRequester } from '@/src/services/requesters/find-or-create';
import { createTicket } from '@/src/services/tickets/create';
import { audit } from '@/src/services/audit/log';
import { runRules } from '@/src/services/rules/run';
import {
  extractEvents,
  type WaWebhookPayload,
  type WaInboundMessage,
  type WaStatusUpdate,
  type WaTemplateStatusValue,
} from './payload';
import { normalizePhoneE164 } from './phone';

export type IngestResult = {
  processedMessages: number;
  processedStatuses: number;
  processedTemplateUpdates: number;
  tickets: Array<{ code: string; created: boolean }>;
};

/**
 * Processa um payload de webhook WhatsApp Cloud API.
 * - Ignora eventos cujo phone_number_id não bata com a conexão.
 * - Mensagens inbound viram TicketMessage (cria ticket novo se requester não tem ticket aberto recente).
 * - Status updates atualizam deliveryStatus de mensagens outbound.
 */
export async function ingestWhatsappWebhook(
  connectionId: string,
  payload: WaWebhookPayload,
): Promise<IngestResult> {
  const conn = await prisma.whatsappConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      organizationId: true,
      phoneNumberId: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!conn || conn.deletedAt || conn.status !== 'active') {
    return { processedMessages: 0, processedStatuses: 0, processedTemplateUpdates: 0, tickets: [] };
  }

  const result: IngestResult = { processedMessages: 0, processedStatuses: 0, processedTemplateUpdates: 0, tickets: [] };
  const { messages, statuses, templateUpdates } = extractEvents(payload);

  for (const { phoneNumberId, message, contactName } of messages) {
    if (phoneNumberId !== conn.phoneNumberId) continue;
    try {
      const r = await ingestMessage(conn.organizationId, conn.id, message, contactName);
      if (r) {
        result.processedMessages += 1;
        result.tickets.push(r);
      }
    } catch (err) {
      logger.warn({ err, messageId: message.id }, 'whatsapp.ingest message failed');
    }
  }

  for (const { phoneNumberId, status } of statuses) {
    if (phoneNumberId !== conn.phoneNumberId) continue;
    try {
      await applyStatusUpdate(conn.organizationId, status);
      result.processedStatuses += 1;
    } catch (err) {
      logger.warn({ err, waId: status.id }, 'whatsapp.ingest status failed');
    }
  }

  for (const tu of templateUpdates) {
    try {
      await applyTemplateStatusUpdate(conn.organizationId, tu);
      result.processedTemplateUpdates += 1;
    } catch (err) {
      logger.warn({ err, metaTemplateId: tu.message_template_id }, 'whatsapp.ingest template update failed');
    }
  }

  if (messages.length > 0) {
    await prisma.whatsappConnection.update({
      where: { id: conn.id },
      data: { lastReceivedAt: new Date(), lastError: null },
    });
  }

  return result;
}

async function ingestMessage(
  organizationId: string,
  connectionId: string,
  msg: WaInboundMessage,
  contactName: string | undefined,
): Promise<{ code: string; created: boolean } | null> {
  // Dedup por wa_message_id
  if (msg.id) {
    const dup = await prisma.ticketMessage.findFirst({
      where: { organizationId, waMessageId: msg.id },
      select: { id: true },
    });
    if (dup) return null;
  }

  const fromPhone = normalizePhoneE164(msg.from);
  if (!fromPhone) return null;

  const body = extractBody(msg);
  const subject = buildSubject(msg, contactName);

  // Antes de criar/anexar a ticket, tenta passar pelo chatbot. Se ele responder, sai daqui
  // e NÃO cria ticket (até decidir escalar). O chatbot grava sua própria sessão.
  if (body && msg.id) {
    try {
      const { runChatbotTurn } = await import('@/src/services/chatbot/run');
      const bot = await runChatbotTurn({
        organizationId,
        connectionId,
        fromPhone,
        contactName,
        text: body,
        waMessageId: msg.id,
      });
      if (bot.handled && !bot.escalated) {
        // Conversa segue no chatbot — não materializa ticket ainda
        return null;
      }
      if (bot.handled && bot.escalated && bot.ticketCode) {
        // Bot escalou e já criou ticket — devolve ele e segue pra anexar a mensagem
        // que o usuário enviou (a mensagem atual) no ticket recém-criado.
        // Continuamos o fluxo abaixo, mas force a busca pelo ticket criado.
      }
    } catch (err) {
      logger.warn({ err, connectionId }, 'chatbot turn failed (continuing to ticket path)');
    }
  }

  // Resolve requester por phone
  const requester = await findOrCreateRequester(organizationId, {
    phone: fromPhone,
    name: contactName ?? null,
  });

  // Tenta achar ticket existente ATIVO desse requester (aberto/em_progresso/aguardando)
  // Heurística simples: ticket mais recente não-fechado nas últimas 24h
  const recentActive = await prisma.ticket.findFirst({
    where: {
      organizationId,
      requesterId: requester.id,
      deletedAt: null,
      status: { in: ['new', 'open', 'in_progress', 'pending_customer', 'pending_third_party'] },
      updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, code: true, status: true },
  });

  let ticketId: string;
  let ticketCode: string;
  let created = false;

  if (recentActive) {
    ticketId = recentActive.id;
    ticketCode = recentActive.code;
  } else {
    const t = await createTicket(organizationId, null, {
      subject,
      description: body || null,
      origin: 'whatsapp',
      priority: 'normal',
      status: 'new',
      requester: { phone: fromPhone, name: contactName ?? null },
    });
    ticketId = t.id;
    ticketCode = t.code;
    created = true;
  }

  // Cria a mensagem
  const ticketMessage = await prisma.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({
      data: {
        organizationId,
        ticketId,
        type: 'incoming_whatsapp',
        channel: 'whatsapp',
        authorRequester: requester.id,
        bodyText: body || '(mensagem sem texto)',
        waMessageId: msg.id,
        waFrom: fromPhone,
        waContextId: msg.context?.id ?? null,
        waConnectionId: connectionId,
        deliveryStatus: 'not_applicable',
      },
      select: { id: true },
    });

    await tx.ticketEvent.create({
      data: {
        organizationId,
        ticketId,
        type: 'message_added',
        payload: {
          messageId: m.id,
          type: 'incoming_whatsapp',
          channel: 'whatsapp',
          from: fromPhone,
        } as Prisma.InputJsonObject,
      },
    });

    if (!created) {
      // Volta status se estava pending_customer
      const cur = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: { status: true },
      });
      if (cur?.status === 'pending_customer') {
        await tx.ticket.update({ where: { id: ticketId }, data: { status: 'open' } });
        await tx.ticketEvent.create({
          data: {
            organizationId,
            ticketId,
            type: 'status_changed',
            payload: { from: 'pending_customer', to: 'open', auto: true, by: 'whatsapp_reply' } as Prisma.InputJsonObject,
          },
        });
      }
    }

    return m;
  });

  await audit({
    organizationId,
    actorUserId: null,
    action: created ? 'whatsapp.ticket.created' : 'whatsapp.message.appended',
    resourceType: 'ticket',
    resourceId: ticketId,
    diff: { after: { ticketCode, from: fromPhone, messageId: ticketMessage.id } },
  });

  // Disparar regras email_received → renomeada conceitualmente: message_received
  // (mantemos email_received por compat e adicionamos disparo equivalente)
  try {
    await runRules({
      organizationId,
      ticketId,
      trigger: 'email_received', // reusa trigger pra mensagens inbound
      extra: { whatsapp: { from: fromPhone, body, messageId: msg.id } },
    });
  } catch (err) {
    logger.warn({ err, ticketId }, 'runRules on whatsapp message failed (continuing)');
  }

  return { code: ticketCode, created };
}

function extractBody(msg: WaInboundMessage): string {
  if (msg.text?.body) return msg.text.body;
  if (msg.image) return msg.image.caption ? `[imagem] ${msg.image.caption}` : '[imagem]';
  if (msg.video) return msg.video.caption ? `[vídeo] ${msg.video.caption}` : '[vídeo]';
  if (msg.audio) return '[áudio]';
  if (msg.document) return msg.document.caption ? `[documento ${msg.document.filename ?? ''}] ${msg.document.caption}` : `[documento ${msg.document.filename ?? ''}]`;
  if (msg.type === 'location') return '[localização]';
  if (msg.type === 'sticker') return '[sticker]';
  if (msg.type === 'reaction') return '[reação]';
  return `(mensagem ${msg.type})`;
}

function buildSubject(msg: WaInboundMessage, contactName: string | undefined): string {
  const body = msg.text?.body ?? '';
  const head = body.split(/\n/)[0]?.trim().slice(0, 80);
  if (head) return head;
  return `WhatsApp de ${contactName ?? msg.from}`;
}

async function applyStatusUpdate(organizationId: string, status: WaStatusUpdate): Promise<void> {
  // status.id é o wa_message_id da mensagem outbound que enviamos.
  // Pode ser uma mensagem de ticket OU um envio de template.

  // 1) Ticket message (canal regular)
  const msg = await prisma.ticketMessage.findFirst({
    where: { organizationId, waMessageId: status.id },
    select: { id: true, deliveryStatus: true },
  });
  if (msg) {
    let delivery: 'pending' | 'sent' | 'failed' | 'not_applicable';
    switch (status.status) {
      case 'sent': delivery = 'sent'; break;
      case 'delivered':
      case 'read':
        delivery = 'sent';
        break;
      case 'failed': delivery = 'failed'; break;
      default: return;
    }
    await prisma.ticketMessage.update({
      where: { id: msg.id },
      data: {
        deliveryStatus: delivery,
        deliveryError: status.errors?.[0]?.message ?? null,
        sentAt: delivery === 'sent' ? new Date() : undefined,
      },
    });
  }

  // 2) Template send — atualiza status + captura pricing/conversation
  const send = await prisma.whatsappTemplateSend.findFirst({
    where: { organizationId, waMessageId: status.id },
    select: { id: true, status: true, costAmount: true },
  });
  if (send) {
    const nextStatus =
      status.status === 'failed' ? 'failed'
      : status.status === 'read' ? 'read'
      : status.status === 'delivered' ? 'delivered'
      : status.status === 'sent' ? 'sent'
      : send.status;

    const timestampField =
      nextStatus === 'failed' ? { failedAt: new Date() }
      : nextStatus === 'read' ? { readAt: new Date() }
      : nextStatus === 'delivered' ? { deliveredAt: new Date() }
      : {};

    // Cost: Meta não envia valor — derivamos do category + region (tabela local)
    const computedCost =
      status.pricing && send.costAmount == null
        ? computeCost(status.pricing.category)
        : undefined;

    await prisma.whatsappTemplateSend.update({
      where: { id: send.id },
      data: {
        status: nextStatus,
        failureReason: status.errors?.[0]?.message?.slice(0, 1000) ?? undefined,
        waConversationId: status.conversation?.id ?? undefined,
        pricingCategory: status.pricing?.category ?? undefined,
        pricingModel: status.pricing?.pricing_model ?? undefined,
        ...(computedCost
          ? { costAmount: computedCost.amount, costCurrency: computedCost.currency }
          : {}),
        ...timestampField,
      },
    });
  }
}

/** Atualiza status do template local quando Meta envia message_template_status_update. */
async function applyTemplateStatusUpdate(
  organizationId: string,
  tu: WaTemplateStatusValue,
): Promise<void> {
  const metaId = String(tu.message_template_id);
  const tpl = await prisma.whatsappTemplate.findFirst({
    where: { organizationId, metaTemplateId: metaId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!tpl) {
    logger.info({ organizationId, metaId, name: tu.message_template_name }, 'template not found locally, ignoring');
    return;
  }
  const status = mapMetaEvent(tu.event);
  await prisma.whatsappTemplate.update({
    where: { id: tpl.id },
    data: {
      status,
      rejectionReason: tu.reason?.slice(0, 1000) ?? null,
      approvedAt: status === 'approved' ? new Date() : null,
    },
  });
}

function mapMetaEvent(e: string): 'approved' | 'rejected' | 'paused' | 'disabled' | 'pending' {
  switch (e?.toUpperCase()) {
    case 'APPROVED': return 'approved';
    case 'REJECTED': return 'rejected';
    case 'PAUSED': return 'paused';
    case 'DISABLED':
    case 'PENDING_DELETION': return 'disabled';
    case 'IN_APPEAL': return 'rejected';
    default: return 'pending';
  }
}

/**
 * Tabela de preços por categoria — fonte: Meta Pricing Updates Brasil (2025-2026, USD).
 * Service inicia em 0; service conversations passam a ser cobradas apenas se origem
 * marketing/utility/auth. Authentication-international tem rate maior, ignoramos por simplicidade.
 */
function computeCost(category: string | undefined): { amount: number; currency: string } | null {
  if (!category) return null;
  const c = category.toLowerCase();
  const table: Record<string, number> = {
    marketing: 0.0625,
    utility: 0.0125,
    authentication: 0.0315,
    service: 0,
  };
  if (!(c in table)) return null;
  return { amount: table[c]!, currency: 'USD' };
}
