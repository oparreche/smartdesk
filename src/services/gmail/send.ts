import 'server-only';
import { google } from 'googleapis';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { authenticatedClient } from './oauth';

export type SendEmailPayload = {
  /** ID do TicketMessage que será enviado. */
  ticketMessageId: string;
};

export type SendResult =
  | { sent: true; gmailMessageId: string; gmailThreadId: string | null }
  | { skipped: true; reason: string };

/**
 * Envia o TicketMessage (resposta pública) via Gmail da conta conectada da org.
 *
 * Threading: o subject vai com `[HELP-NNNN]` + `In-Reply-To` + `References`
 * apontando para o último Message-ID inbound do ticket (se existir).
 */
export async function sendTicketMessage(payload: SendEmailPayload): Promise<SendResult> {
  const ticketMessage = await prisma.ticketMessage.findUnique({
    where: { id: payload.ticketMessageId },
    select: {
      id: true,
      organizationId: true,
      ticketId: true,
      type: true,
      bodyText: true,
      bodyHtml: true,
      deliveryStatus: true,
      ticket: {
        select: {
          id: true,
          code: true,
          subject: true,
          requester: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!ticketMessage) return { skipped: true, reason: 'message_not_found' };
  if (ticketMessage.type !== 'public_reply') return { skipped: true, reason: 'not_public_reply' };
  if (ticketMessage.deliveryStatus === 'sent') return { skipped: true, reason: 'already_sent' };

  const requesterEmail = ticketMessage.ticket.requester.email;
  if (!requesterEmail) {
    await prisma.ticketMessage.update({
      where: { id: ticketMessage.id },
      data: { deliveryStatus: 'failed', deliveryError: 'Solicitante sem email' },
    });
    return { skipped: true, reason: 'no_requester_email' };
  }

  // Pega uma conexão ativa da org (preferindo a primeira)
  const connection = await prisma.gmailConnection.findFirst({
    where: { organizationId: ticketMessage.organizationId, status: 'active', deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!connection) {
    await prisma.ticketMessage.update({
      where: { id: ticketMessage.id },
      data: { deliveryStatus: 'not_applicable', deliveryError: null },
    });
    return { skipped: true, reason: 'no_gmail_connection' };
  }

  const { client, emailAddress } = await authenticatedClient(connection.id);
  const gmail = google.gmail({ version: 'v1', auth: client });

  // Última mensagem inbound do ticket — pra threading
  const lastInbound = await prisma.ticketMessage.findFirst({
    where: {
      organizationId: ticketMessage.organizationId,
      ticketId: ticketMessage.ticketId,
      emailDirection: 'inbound',
      emailMessageId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { emailMessageId: true, emailReferences: true },
  });

  const subject = ensureCodePrefix(ticketMessage.ticket.code, ticketMessage.ticket.subject);
  const bodyText = ticketMessage.bodyText ?? stripHtml(ticketMessage.bodyHtml) ?? '';

  const headers: Record<string, string> = {
    'From': `"${ticketMessage.ticket.requester.name ?? emailAddress}" <${emailAddress}>`.replace(/"\s*<\s*</, '<'),
    'To': ticketMessage.ticket.requester.name
      ? `"${ticketMessage.ticket.requester.name}" <${requesterEmail}>`
      : requesterEmail,
    'Subject': subject,
    'MIME-Version': '1.0',
    'Content-Type': 'text/plain; charset="utf-8"',
    'Content-Transfer-Encoding': '7bit',
  };
  // From sem o "From: nome" duplicado: simplificando
  headers['From'] = `"${ticketMessage.ticket.requester.name ?? 'SmartDesk'}" <${emailAddress}>`;
  headers['From'] = emailAddress;

  if (lastInbound?.emailMessageId) {
    headers['In-Reply-To'] = lastInbound.emailMessageId;
    const refs = [lastInbound.emailReferences, lastInbound.emailMessageId]
      .filter(Boolean)
      .join(' ');
    if (refs) headers['References'] = refs;
  }

  const raw = buildRawMessage(headers, bodyText);

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    const gmailMessageId = res.data.id ?? '';
    const gmailThreadId = res.data.threadId ?? null;

    // Obtém Message-ID gerado pelo Gmail (pra futuras correlações)
    let rfcMessageId: string | null = null;
    try {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: gmailMessageId,
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'Message-Id'],
      });
      const headers2 = full.data.payload?.headers ?? [];
      rfcMessageId =
        headers2.find((h) => h.name?.toLowerCase() === 'message-id')?.value ?? null;
    } catch {
      // ok, segue sem
    }

    await prisma.ticketMessage.update({
      where: { id: ticketMessage.id },
      data: {
        deliveryStatus: 'sent',
        sentAt: new Date(),
        deliveryError: null,
        emailMessageId: rfcMessageId,
        emailFrom: emailAddress,
        emailTo: requesterEmail,
      },
    });

    // firstResponseAt do ticket
    await prisma.ticket.updateMany({
      where: { id: ticketMessage.ticketId, firstResponseAt: null },
      data: { firstResponseAt: new Date() },
    });

    logger.info(
      { messageId: ticketMessage.id, gmailMessageId, ticketCode: ticketMessage.ticket.code },
      'gmail.send sent',
    );

    return { sent: true, gmailMessageId, gmailThreadId };
  } catch (err) {
    const e = err as Error;
    await prisma.ticketMessage.update({
      where: { id: ticketMessage.id },
      data: {
        deliveryStatus: 'failed',
        deliveryError: e.message.slice(0, 1000),
      },
    });
    logger.warn({ messageId: ticketMessage.id, err: e.message }, 'gmail.send failed');
    throw e;
  }
}

function ensureCodePrefix(code: string, subject: string): string {
  if (subject.includes(`[${code}]`)) return subject;
  return `[${code}] ${subject}`;
}

function buildRawMessage(headers: Record<string, string>, body: string): string {
  const head = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');
  const msg = `${head}\r\n\r\n${body}`;
  return Buffer.from(msg, 'utf8').toString('base64url');
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}
