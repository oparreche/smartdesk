import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { getConnectionWithCreds } from './setup';
import { sendViaSmtp } from './smtp';

export type SendResult =
  | { sent: true; messageId: string; via: 'imap_smtp'; connectionId: string }
  | { skipped: true; reason: string };

/**
 * Envia um TicketMessage (public_reply) via SMTP de uma ImapSmtpConnection.
 * Escolhe a conexão com mesmo email do `requester`, ou a primeira ativa.
 */
export async function sendTicketMessageViaSmtp(payload: {
  ticketMessageId: string;
}): Promise<SendResult> {
  const tm = await prisma.ticketMessage.findUnique({
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
          origin: true,
          requester: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!tm) return { skipped: true, reason: 'message_not_found' };
  if (tm.type !== 'public_reply') return { skipped: true, reason: 'not_public_reply' };
  if (tm.deliveryStatus === 'sent') return { skipped: true, reason: 'already_sent' };

  const requesterEmail = tm.ticket.requester.email;
  if (!requesterEmail) {
    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: { deliveryStatus: 'failed', deliveryError: 'Solicitante sem email' },
    });
    return { skipped: true, reason: 'no_requester_email' };
  }

  // Procura conexão ativa: primeira disponível (no futuro: por inbound origem do ticket)
  const conn = await prisma.imapSmtpConnection.findFirst({
    where: {
      organizationId: tm.organizationId,
      status: 'active',
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!conn) {
    return { skipped: true, reason: 'no_smtp_connection' };
  }

  const cred = await getConnectionWithCreds(conn.id);
  if (!cred) return { skipped: true, reason: 'connection_credential_missing' };

  // Threading: pega último inbound do ticket
  const lastInbound = await prisma.ticketMessage.findFirst({
    where: {
      organizationId: tm.organizationId,
      ticketId: tm.ticketId,
      emailDirection: 'inbound',
      emailMessageId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { emailMessageId: true, emailReferences: true },
  });

  const subject = ensureCodePrefix(tm.ticket.code, tm.ticket.subject);
  const bodyText = tm.bodyText ?? stripHtml(tm.bodyHtml) ?? '';

  try {
    const result = await sendViaSmtp(
      {
        host: cred.smtpHost,
        port: cred.smtpPort,
        security: cred.smtpSecurity,
        user: cred.smtpUser,
        password: cred.smtpPassword,
        fromName: cred.smtpFromName,
        fromAddress: cred.emailAddress,
      },
      {
        to: tm.ticket.requester.name
          ? `"${tm.ticket.requester.name}" <${requesterEmail}>`
          : requesterEmail,
        subject,
        bodyText,
        bodyHtml: tm.bodyHtml,
        inReplyTo: lastInbound?.emailMessageId ?? null,
        references: lastInbound
          ? [lastInbound.emailReferences, lastInbound.emailMessageId].filter(Boolean).join(' ')
          : null,
        extraHeaders: {
          'X-SmartDesk-Ticket': tm.ticket.code,
        },
      },
    );

    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: {
        deliveryStatus: 'sent',
        deliveryError: null,
        emailMessageId: result.messageId,
      },
    });

    logger.info(
      { ticketCode: tm.ticket.code, to: requesterEmail, messageId: result.messageId, via: 'smtp' },
      'imap.send ok',
    );

    return {
      sent: true,
      messageId: result.messageId,
      via: 'imap_smtp',
      connectionId: conn.id,
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    await prisma.ticketMessage.update({
      where: { id: tm.id },
      data: { deliveryStatus: 'failed', deliveryError: errMsg.slice(0, 500) },
    });
    logger.error({ err, ticketCode: tm.ticket.code }, 'imap.send failed');
    throw err;
  }
}

function ensureCodePrefix(code: string, subject: string): string {
  if (subject.toLowerCase().includes(`[${code.toLowerCase()}]`)) {
    return subject;
  }
  if (/^re:\s*/i.test(subject)) {
    return subject.replace(/^re:\s*/i, `Re: [${code}] `);
  }
  return `[${code}] ${subject}`;
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
