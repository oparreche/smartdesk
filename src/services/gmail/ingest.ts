import 'server-only';
import { google, type gmail_v1 } from 'googleapis';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { putObject, buildAttachmentKey } from '@/src/lib/s3';
import { findOrCreateRequester } from '@/src/services/requesters/find-or-create';
import { createTicket } from '@/src/services/tickets/create';
import { audit } from '@/src/services/audit/log';
import { authenticatedClient } from './oauth';
import { matchSender, type RoutingMatch } from './routing';
import {
  parseMessage,
  extractEmailAddress,
  extractDisplayName,
  extractTicketCode,
  looksAutoSubmitted,
  type ParsedEmail,
} from './parse';

export type IngestMessagePayload = {
  connectionId: string;
  messageId: string;
};

export type IngestOptions = {
  /** Permite injetar uma mensagem já parseada (útil em testes). */
  preFetched?: gmail_v1.Schema$Message;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS = 10;

export type IngestResult =
  | { skipped: true; reason: string }
  | { ticketCode: string; ticketId: string; created: boolean; messageId: string };

/**
 * Ingere uma mensagem do Gmail: parseia, identifica/atualiza ticket, baixa anexos.
 * Lança em erros transientes (Google API down etc) para retry; retorna `{skipped}`
 * em casos terminais (loop, auto-resposta, mensagem nossa).
 */
export async function ingestMessage(
  payload: IngestMessagePayload,
  options: IngestOptions = {},
): Promise<IngestResult> {
  let message: gmail_v1.Schema$Message;
  let emailAddress: string;
  let organizationId: string;
  let gmail: ReturnType<typeof google.gmail> | null = null;

  if (options.preFetched) {
    message = options.preFetched;
    // Lê metadata da conexão sem autenticar — útil em testes ou retomadas
    const conn = await prisma.gmailConnection.findUniqueOrThrow({
      where: { id: payload.connectionId },
      select: { emailAddress: true, organizationId: true },
    });
    emailAddress = conn.emailAddress;
    organizationId = conn.organizationId;
    // gmail client só criado se houver anexo (lazy mais abaixo)
  } else {
    const auth = await authenticatedClient(payload.connectionId);
    emailAddress = auth.emailAddress;
    organizationId = auth.organizationId;
    gmail = google.gmail({ version: 'v1', auth: auth.client });
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: payload.messageId,
      format: 'full',
    });
    message = res.data;
  }

  const parsed = parseMessage(message);
  const h = parsed.headers;

  // Filtros: auto-submitted, precedence bulk
  if (looksAutoSubmitted(h)) {
    logger.info(
      { connectionId: payload.connectionId, messageId: payload.messageId, autoSubmitted: h.autoSubmitted, precedence: h.precedence },
      'gmail.ingest skipped auto-submitted',
    );
    return { skipped: true, reason: 'auto_submitted' };
  }

  // Ignorar mensagens enviadas por nós mesmos (a conta conectada)
  const fromEmail = extractEmailAddress(h.from);
  if (fromEmail && fromEmail.toLowerCase() === emailAddress.toLowerCase()) {
    return { skipped: true, reason: 'self_sent' };
  }

  // Regras de roteamento por remetente (ignore / tag)
  let routing: RoutingMatch | null = null;
  if (fromEmail) {
    routing = await matchSender(organizationId, h.from ?? fromEmail);
    if (routing?.action === 'ignore') {
      logger.info(
        {
          connectionId: payload.connectionId,
          messageId: payload.messageId,
          ruleId: routing.ruleId,
          pattern: routing.pattern,
          from: fromEmail,
        },
        'gmail.ingest skipped by routing rule',
      );
      return { skipped: true, reason: `routing_ignore:${routing.pattern}` };
    }
  }

  // Dedup: já tem mensagem com este Message-ID?
  if (h.messageId) {
    const existing = await prisma.ticketMessage.findFirst({
      where: { organizationId, emailMessageId: h.messageId },
      select: { id: true, ticketId: true },
    });
    if (existing) {
      return { skipped: true, reason: 'already_ingested' };
    }
  }

  // Identifica ticket existente
  let ticketId: string | null = null;
  let ticketCode: string | null = null;
  let ticketCreated = false;

  const codeFromSubject = extractTicketCode(h.subject);
  if (codeFromSubject) {
    const found = await prisma.ticket.findFirst({
      where: { organizationId, code: codeFromSubject, deletedAt: null },
      select: { id: true, code: true, status: true },
    });
    if (found) {
      ticketId = found.id;
      ticketCode = found.code;
    }
  }

  if (!ticketId && (h.inReplyTo || h.references)) {
    const candidates = [h.inReplyTo, ...(h.references?.split(/\s+/) ?? [])]
      .filter(Boolean) as string[];
    const related = await prisma.ticketMessage.findFirst({
      where: {
        organizationId,
        emailMessageId: { in: candidates },
      },
      select: { ticketId: true, ticket: { select: { code: true } } },
    });
    if (related) {
      ticketId = related.ticketId;
      ticketCode = related.ticket.code;
    }
  }

  // Resolve requester
  const requester = await findOrCreateRequester(organizationId, {
    email: fromEmail,
    name: extractDisplayName(h.from),
  });

  const bodyText = parsed.bodyText ?? stripHtml(parsed.bodyHtml);
  const subject = (h.subject ?? '(sem assunto)').replace(/\s*\[HELP-\d+\]\s*/i, '').trim() || '(sem assunto)';

  // Cria ticket se não existir
  if (!ticketId) {
    const newTicket = await createTicket(organizationId, null, {
      subject,
      description: bodyText ?? null,
      origin: 'gmail',
      priority: 'normal',
      status: 'new',
      requester: { email: fromEmail, name: extractDisplayName(h.from) },
    });
    ticketId = newTicket.id;
    ticketCode = newTicket.code;
    ticketCreated = true;
  }

  // Cria mensagem
  const ticketMessage = await prisma.$transaction(async (tx) => {
    const msg = await tx.ticketMessage.create({
      data: {
        organizationId,
        ticketId: ticketId!,
        type: 'incoming_email',
        channel: 'email',
        authorRequester: requester.id,
        bodyText: bodyText ?? null,
        bodyHtml: parsed.bodyHtml ?? null,
        emailMessageId: h.messageId,
        emailInReplyTo: h.inReplyTo,
        emailReferences: h.references,
        emailFrom: h.from,
        emailTo: h.to,
        emailCc: h.cc,
        emailBcc: h.bcc,
        emailDirection: 'inbound',
        deliveryStatus: 'not_applicable',
      },
      select: { id: true },
    });

    await tx.ticketEvent.create({
      data: {
        organizationId,
        ticketId: ticketId!,
        type: 'message_added',
        payload: { messageId: msg.id, type: 'incoming_email', from: fromEmail } as Prisma.InputJsonObject,
      },
    });

    // Se ticket estava pending_customer, volta pra open
    const current = await tx.ticket.findUnique({
      where: { id: ticketId! },
      select: { status: true },
    });
    if (current?.status === 'pending_customer') {
      await tx.ticket.update({
        where: { id: ticketId! },
        data: { status: 'open' },
      });
      await tx.ticketEvent.create({
        data: {
          organizationId,
          ticketId: ticketId!,
          type: 'status_changed',
          payload: { from: 'pending_customer', to: 'open', auto: true, by: 'gmail_reply' } as Prisma.InputJsonObject,
        },
      });
    }

    return msg;
  });

  // Anexos — baixa serially (geralmente são poucos). Se não houver gmail client
  // (modo preFetched de teste), instancia agora se houver anexo a baixar.
  const attachmentsToProcess = parsed.attachments.slice(0, MAX_TOTAL_ATTACHMENTS);
  if (attachmentsToProcess.length > 0 && !gmail) {
    const auth = await authenticatedClient(payload.connectionId);
    gmail = google.gmail({ version: 'v1', auth: auth.client });
  }
  for (const att of attachmentsToProcess) {
    if (!gmail) break;
    if (att.sizeBytes > MAX_ATTACHMENT_BYTES) {
      logger.warn({ filename: att.filename, sizeBytes: att.sizeBytes }, 'gmail.ingest attachment too large, skipped');
      continue;
    }
    try {
      const att_res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: payload.messageId,
        id: att.attachmentId,
      });
      const data = att_res.data.data;
      if (!data) continue;
      const buf = Buffer.from(data, 'base64url');
      const key = buildAttachmentKey(organizationId, ticketId!, att.filename);
      await putObject({ key, body: buf, contentType: att.contentType });
      await prisma.ticketAttachment.create({
        data: {
          organizationId,
          ticketId: ticketId!,
          messageId: ticketMessage.id,
          filename: att.filename,
          contentType: att.contentType,
          sizeBytes: buf.length,
          storageKey: key,
        },
      });
    } catch (err) {
      logger.warn({ err, filename: att.filename }, 'gmail.ingest attachment failed');
    }
  }

  // Atualiza historyId / lastSyncedAt da conexão
  if (message.historyId) {
    await prisma.gmailConnection.update({
      where: { id: payload.connectionId },
      data: { historyId: String(message.historyId), lastSyncedAt: new Date() },
    });
  }

  // Aplica tag de roteamento (regra "tag" do email_routing_rules)
  if (routing?.action === 'tag') {
    try {
      await applyRoutingTag(organizationId, ticketId!, routing.tagName, routing.ruleId);
    } catch (err) {
      logger.warn(
        { err, ticketId, tag: routing.tagName, ruleId: routing.ruleId },
        'gmail.ingest routing tag failed (continuing)',
      );
    }
  }

  await audit({
    organizationId,
    actorUserId: null,
    action: ticketCreated ? 'gmail.ticket.created' : 'gmail.message.appended',
    resourceType: 'ticket',
    resourceId: ticketId!,
    diff: { after: { messageId: ticketMessage.id, from: fromEmail, subject } },
  });

  // Trigger regras `email_received`. (Se ticket foi criado, createTicket
  // já disparou `ticket_created` — aqui complementamos com email_received.)
  try {
    const { runRules } = await import('@/src/services/rules/run');
    await runRules({
      organizationId,
      ticketId: ticketId!,
      trigger: 'email_received',
      extra: { email: { from: fromEmail, subject, messageId: h.messageId } },
    });
  } catch (err) {
    logger.warn({ err, ticketId }, 'runRules on email_received failed (continuing)');
  }

  logger.info(
    { org: organizationId, ticketCode, created: ticketCreated, messageId: ticketMessage.id, from: fromEmail },
    'gmail.ingest done',
  );

  return {
    ticketCode: ticketCode!,
    ticketId: ticketId!,
    created: ticketCreated,
    messageId: ticketMessage.id,
  };
}

async function applyRoutingTag(
  organizationId: string,
  ticketId: string,
  rawTagName: string,
  ruleId: string,
): Promise<void> {
  const name = rawTagName.trim().slice(0, 60);
  if (!name) return;

  let tag = await prisma.tag.findFirst({
    where: { organizationId, name },
    select: { id: true },
  });
  if (!tag) {
    tag = await prisma.tag.create({
      data: { organizationId, name },
      select: { id: true },
    });
  }

  const existing = await prisma.ticketTag.findFirst({
    where: { ticketId, tagId: tag.id },
    select: { ticketId: true },
  });
  if (existing) return;

  await prisma.$transaction([
    prisma.ticketTag.create({ data: { ticketId, tagId: tag.id } }),
    prisma.ticketEvent.create({
      data: {
        organizationId,
        ticketId,
        type: 'tag_added',
        payload: { tag: name, by: 'email_routing', ruleId } as Prisma.InputJsonObject,
      },
    }),
  ]);
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
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
