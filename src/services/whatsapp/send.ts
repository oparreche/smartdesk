import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { safeFetch } from '@/src/lib/http-client';
import { decryptAccessToken } from './setup';
import { normalizePhoneE164 } from './phone';

const GRAPH_VERSION = 'v21.0';

export type SendWhatsappPayload = {
  ticketMessageId: string;
};

export type SendResult =
  | { sent: true; waMessageId: string }
  | { skipped: true; reason: string };

/**
 * Envia uma mensagem de texto via WhatsApp Cloud API.
 *
 * Pré-condições:
 *  - TicketMessage com type='outgoing_whatsapp', channel='whatsapp', waConnectionId definido
 *  - waTo definido (telefone destinatário em formato dígitos com country code)
 *  - Conexão active
 *
 * Limitações no MVP:
 *  - Apenas mensagens TEXTO (sem templates HSM).
 *  - Janela de 24h após última mensagem do cliente. Fora da janela → erro Meta.
 */
export async function sendWhatsappMessage(payload: SendWhatsappPayload): Promise<SendResult> {
  const tm = await prisma.ticketMessage.findUnique({
    where: { id: payload.ticketMessageId },
    select: {
      id: true,
      organizationId: true,
      ticketId: true,
      type: true,
      bodyText: true,
      waTo: true,
      waConnectionId: true,
      deliveryStatus: true,
      ticket: { select: { code: true } },
    },
  });
  if (!tm) return { skipped: true, reason: 'message_not_found' };
  if (tm.type !== 'outgoing_whatsapp') return { skipped: true, reason: 'not_whatsapp_outbound' };
  if (tm.deliveryStatus === 'sent') return { skipped: true, reason: 'already_sent' };

  if (!tm.waTo || !tm.waConnectionId) {
    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: { deliveryStatus: 'failed', deliveryError: 'destinatário ou conexão ausentes' },
    });
    return { skipped: true, reason: 'missing_recipient_or_connection' };
  }

  const conn = await prisma.whatsappConnection.findUnique({
    where: { id: tm.waConnectionId },
    select: { id: true, phoneNumberId: true, status: true, deletedAt: true, organizationId: true },
  });
  if (!conn || conn.deletedAt || conn.status !== 'active') {
    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: { deliveryStatus: 'failed', deliveryError: 'conexão whatsapp inativa' },
    });
    return { skipped: true, reason: 'connection_inactive' };
  }
  if (conn.organizationId !== tm.organizationId) {
    return { skipped: true, reason: 'connection_org_mismatch' };
  }

  const token = await decryptAccessToken(conn.id);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${conn.phoneNumberId}/messages`;
  const body = JSON.stringify({
    messaging_product: 'whatsapp',
    to: normalizePhoneE164(tm.waTo),
    type: 'text',
    text: { body: tm.bodyText ?? '' },
  });

  try {
    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
      timeoutMs: 12_000,
    });

    if (!res.ok) {
      const parsed = parseJson(res.bodyText);
      const errMsg = (parsed as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      await prisma.ticketMessage.update({
        where: { id: tm.id },
        data: { deliveryStatus: 'failed', deliveryError: errMsg.slice(0, 1000) },
      });
      logger.warn({ messageId: tm.id, err: errMsg, status: res.status }, 'whatsapp.send failed');
      throw new Error(errMsg);
    }

    const parsed = parseJson(res.bodyText) as { messages?: Array<{ id: string }> } | null;
    const waMessageId = parsed?.messages?.[0]?.id ?? '';

    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: {
        deliveryStatus: 'sent',
        sentAt: new Date(),
        deliveryError: null,
        waMessageId,
      },
    });

    // firstResponseAt do ticket
    await prisma.ticket.updateMany({
      where: { id: tm.ticketId, firstResponseAt: null },
      data: { firstResponseAt: new Date() },
    });

    logger.info(
      { messageId: tm.id, waMessageId, ticketCode: tm.ticket.code },
      'whatsapp.send ok',
    );

    return { sent: true, waMessageId };
  } catch (err) {
    const e = err as Error;
    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: {
        deliveryStatus: 'failed',
        deliveryError: e.message.slice(0, 1000),
      },
    });
    throw e;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

void Prisma; // silence unused import for tooling
