import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { findOrCreateRequester } from '@/src/services/requesters/find-or-create';
import { createTicket } from '@/src/services/tickets/create';
import { audit } from '@/src/services/audit/log';
import { extractTicketCode } from '@/src/services/gmail/parse';
import { matchSender, type RoutingMatch } from '@/src/services/gmail/routing';
import {
  fetchNewMessages,
  firstAddressEmail,
  joinAddresses,
  type ImapMessage,
} from './client';
import { getConnectionWithCreds } from './setup';

export type IngestImapResult = {
  connectionId: string;
  fetched: number;
  ingested: number;
  skipped: number;
  failed: number;
  errors: Array<{ uid: number; reason: string }>;
};

const MAX_PER_RUN = 50;

export async function pollConnection(connectionId: string): Promise<IngestImapResult> {
  const conn = await getConnectionWithCreds(connectionId);
  if (!conn) {
    return { connectionId, fetched: 0, ingested: 0, skipped: 0, failed: 0, errors: [] };
  }
  if (conn.status !== 'active') {
    return { connectionId, fetched: 0, ingested: 0, skipped: 0, failed: 0, errors: [] };
  }

  const organizationId = conn.organizationId;
  let result: IngestImapResult = {
    connectionId,
    fetched: 0,
    ingested: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  let latestUid = conn.lastUid ?? 0;
  let uidValidity: bigint | null = null;

  try {
    const fetch = await fetchNewMessages(
      {
        host: conn.imapHost,
        port: conn.imapPort,
        security: conn.imapSecurity,
        user: conn.imapUser,
        password: conn.imapPassword,
        folder: conn.imapFolder,
      },
      {
        sinceUid: conn.lastUid ?? 0,
        knownUidValidity: conn.lastUidValidity,
        maxMessages: MAX_PER_RUN,
      },
    );

    uidValidity = fetch.uidValidity;
    result.fetched = fetch.messages.length;

    for (const msg of fetch.messages) {
      try {
        const r = await ingestSingle(organizationId, conn.id, conn.emailAddress, msg);
        if (r === 'ingested') result.ingested++;
        else result.skipped++;
        if (msg.uid > latestUid) latestUid = msg.uid;
      } catch (err) {
        result.failed++;
        result.errors.push({ uid: msg.uid, reason: (err as Error).message });
        logger.warn({ err, connectionId, uid: msg.uid }, 'imap.ingest message failed');
      }
    }

    await prisma.imapSmtpConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncedAt: new Date(),
        lastUid: latestUid,
        lastUidValidity: uidValidity,
        lastError: null,
        lastErrorAt: null,
        status: 'active',
      },
    });

    return result;
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ err, connectionId }, 'imap.poll failed');
    await prisma.imapSmtpConnection.update({
      where: { id: connectionId },
      data: {
        status: 'error',
        lastError: msg.slice(0, 1000),
        lastErrorAt: new Date(),
      },
    });
    throw err;
  }
}

async function ingestSingle(
  organizationId: string,
  connectionId: string,
  channelEmail: string,
  msg: ImapMessage,
): Promise<'ingested' | 'skipped'> {
  const p = msg.parsed;
  const messageId = p.messageId ?? null;
  const fromEmail = firstAddressEmail(p.from);
  const fromRaw = p.from?.text ?? fromEmail ?? '';
  const subject = (p.subject ?? '(sem assunto)').replace(/\s*\[HELP-\d+\]\s*/i, '').trim() || '(sem assunto)';
  const bodyText = p.text ?? null;
  const bodyHtml = p.html === false ? null : p.html ?? null;

  // Ignora mensagens enviadas pelo próprio canal (loop)
  if (fromEmail && fromEmail === channelEmail.toLowerCase()) {
    return 'skipped';
  }

  // Auto-submitted / bulk
  const autoSubmitted = p.headers.get('auto-submitted');
  const precedence = p.headers.get('precedence');
  if (
    autoSubmitted &&
    typeof autoSubmitted === 'string' &&
    autoSubmitted.toLowerCase() !== 'no'
  ) {
    return 'skipped';
  }
  if (
    precedence &&
    typeof precedence === 'string' &&
    ['bulk', 'list', 'junk'].includes(precedence.toLowerCase())
  ) {
    return 'skipped';
  }

  // Dedup por Message-ID
  if (messageId) {
    const existing = await prisma.ticketMessage.findFirst({
      where: { organizationId, emailMessageId: messageId },
      select: { id: true },
    });
    if (existing) return 'skipped';
  }

  // Roteamento por remetente
  let routing: RoutingMatch | null = null;
  if (fromEmail) {
    routing = await matchSender(organizationId, fromRaw || fromEmail);
    if (routing?.action === 'ignore') {
      logger.info(
        { organizationId, ruleId: routing.ruleId, pattern: routing.pattern, from: fromEmail },
        'imap.ingest skipped by routing rule',
      );
      return 'skipped';
    }
  }

  if (!fromEmail) return 'skipped';

  // Identifica ticket existente (via subject [HELP-N] ou In-Reply-To/References)
  let ticketId: string | null = null;
  let ticketCode: string | null = null;
  let ticketCreated = false;

  const codeFromSubject = extractTicketCode(p.subject ?? null);
  if (codeFromSubject) {
    const found = await prisma.ticket.findFirst({
      where: { organizationId, code: codeFromSubject, deletedAt: null },
      select: { id: true, code: true },
    });
    if (found) {
      ticketId = found.id;
      ticketCode = found.code;
    }
  }

  if (!ticketId) {
    const inReplyTo = p.inReplyTo ?? null;
    const refsRaw = p.references;
    const refs = Array.isArray(refsRaw) ? refsRaw : refsRaw ? [refsRaw] : [];
    const candidates = [inReplyTo, ...refs].filter(Boolean) as string[];
    if (candidates.length > 0) {
      const related = await prisma.ticketMessage.findFirst({
        where: { organizationId, emailMessageId: { in: candidates } },
        select: { ticketId: true, ticket: { select: { code: true } } },
      });
      if (related) {
        ticketId = related.ticketId;
        ticketCode = related.ticket.code;
      }
    }
  }

  const requester = await findOrCreateRequester(organizationId, {
    email: fromEmail,
    name: p.from?.value?.[0]?.name?.trim() || null,
  });

  if (!ticketId) {
    const newTicket = await createTicket(organizationId, null, {
      subject,
      description: bodyText ?? null,
      origin: 'imap',
      priority: 'normal',
      status: 'new',
      requester: {
        email: fromEmail,
        name: p.from?.value?.[0]?.name?.trim() || null,
      },
    });
    ticketId = newTicket.id;
    ticketCode = newTicket.code;
    ticketCreated = true;
  }

  const inReplyTo = p.inReplyTo ?? null;
  const refsField = Array.isArray(p.references)
    ? p.references.join(' ')
    : p.references ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const tm = await tx.ticketMessage.create({
      data: {
        organizationId,
        ticketId: ticketId!,
        type: 'incoming_email',
        channel: 'email',
        authorRequester: requester.id,
        bodyText,
        bodyHtml,
        emailMessageId: messageId,
        emailInReplyTo: inReplyTo,
        emailReferences: refsField,
        emailFrom: fromRaw,
        emailTo: joinAddresses(p.to),
        emailCc: joinAddresses(p.cc),
        emailBcc: joinAddresses(p.bcc),
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
        payload: {
          messageId: tm.id,
          type: 'incoming_email',
          from: fromEmail,
          via: 'imap',
          connectionId,
        } as Prisma.InputJsonObject,
      },
    });

    const cur = await tx.ticket.findUnique({
      where: { id: ticketId! },
      select: { status: true },
    });
    if (cur?.status === 'pending_customer') {
      await tx.ticket.update({
        where: { id: ticketId! },
        data: { status: 'open' },
      });
      await tx.ticketEvent.create({
        data: {
          organizationId,
          ticketId: ticketId!,
          type: 'status_changed',
          payload: { from: 'pending_customer', to: 'open', auto: true, by: 'imap_reply' } as Prisma.InputJsonObject,
        },
      });
    }
    return tm;
  });

  // Anexos (in-memory do mailparser)
  if (p.attachments && p.attachments.length > 0) {
    const { putObject, buildAttachmentKey } = await import('@/src/lib/s3');
    let count = 0;
    for (const att of p.attachments) {
      if (count >= 10) break;
      if (!att.content || att.size > 25 * 1024 * 1024) continue;
      const filename = att.filename ?? 'anexo';
      const key = buildAttachmentKey(organizationId, ticketId!, filename);
      try {
        await putObject({
          key,
          body: att.content,
          contentType: att.contentType || 'application/octet-stream',
        });
        await prisma.ticketAttachment.create({
          data: {
            organizationId,
            ticketId: ticketId!,
            messageId: created.id,
            filename: filename.slice(0, 255),
            contentType: (att.contentType || 'application/octet-stream').slice(0, 200),
            sizeBytes: att.size,
            storageKey: key,
          },
        });
        count++;
      } catch (err) {
        logger.warn({ err, filename }, 'imap.ingest attachment failed');
      }
    }
  }

  // Tag de roteamento (após criação)
  if (routing?.action === 'tag') {
    try {
      await applyRoutingTag(organizationId, ticketId!, routing.tagName, routing.ruleId);
    } catch (err) {
      logger.warn({ err, ticketId, tag: routing.tagName }, 'imap.ingest routing tag failed');
    }
  }

  await audit({
    organizationId,
    actorUserId: null,
    action: ticketCreated ? 'imap.ticket.created' : 'imap.message.appended',
    resourceType: 'ticket',
    resourceId: ticketId!,
    diff: { after: { messageId: created.id, from: fromEmail, subject, connectionId } },
  });

  // Regras de automação `email_received`
  try {
    const { runRules } = await import('@/src/services/rules/run');
    await runRules({
      organizationId,
      ticketId: ticketId!,
      trigger: 'email_received',
      extra: { email: { from: fromEmail, subject, messageId, via: 'imap' } },
    });
  } catch (err) {
    logger.warn({ err, ticketId }, 'runRules on email_received failed (continuing)');
  }

  logger.info(
    { org: organizationId, ticketCode, created: ticketCreated, from: fromEmail, via: 'imap' },
    'imap.ingest done',
  );
  return 'ingested';
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
