import 'server-only';
import { type Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { enqueue } from '@/src/services/jobs/enqueue';
import { normalizePhoneE164 } from '@/src/services/whatsapp/phone';

export type AddMessageAttachment = {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export type AddMessageInput = {
  /**
   * 'public_reply'  → vai pro canal escolhido (email | whatsapp). Detecta auto se omitido.
   * 'internal_note' → fica interna, não envia.
   */
  type: 'public_reply' | 'internal_note';
  body: string;
  /**
   * Canal de envio quando type='public_reply'. Se omitido, detecta auto a partir
   * da última mensagem inbound do ticket, com fallback para canal disponível.
   */
  channel?: 'email' | 'whatsapp';
  /** Anexos previamente subidos via signed PUT no S3. */
  attachments?: AddMessageAttachment[];
};

export async function addTicketMessage(
  organizationId: string,
  actorUserId: string,
  ticketId: string,
  input: AddMessageInput,
): Promise<{ id: string; resolvedChannel: 'email' | 'whatsapp' | 'none' }> {
  if (!input.body.trim()) {
    throw new Error('Mensagem vazia');
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: {
      id: true,
      firstResponseAt: true,
      status: true,
      origin: true,
      requester: { select: { id: true, email: true, phone: true } },
    },
  });
  if (!ticket) throw new Error('Ticket não encontrado');

  const isInternal = input.type === 'internal_note';
  let resolvedChannel: 'email' | 'whatsapp' | 'none' = 'none';

  if (!isInternal) {
    resolvedChannel = await resolveChannel(organizationId, ticket, input.channel);
  }

  // Pré-determinar tipo/metadata
  let dbType: 'public_reply' | 'internal_note' | 'outgoing_whatsapp' = input.type;
  let waConnectionId: string | null = null;
  let waTo: string | null = null;

  if (!isInternal && resolvedChannel === 'whatsapp' && ticket.requester.phone) {
    dbType = 'outgoing_whatsapp';
    // Pega conexão ativa
    const conn = await prisma.whatsappConnection.findFirst({
      where: { organizationId, status: 'active', deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    waConnectionId = conn?.id ?? null;
    waTo = normalizePhoneE164(ticket.requester.phone);
  }

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.ticketMessage.create({
      data: {
        organizationId,
        ticketId,
        type: dbType,
        channel: isInternal ? 'internal' : (resolvedChannel === 'whatsapp' ? 'whatsapp' : resolvedChannel === 'email' ? 'email' : null),
        authorUserId: actorUserId,
        bodyText: input.body.trim(),
        deliveryStatus: isInternal ? 'not_applicable' : 'pending',
        emailDirection: !isInternal && resolvedChannel === 'email' ? 'outbound' : null,
        waConnectionId,
        waTo,
      },
      select: { id: true },
    });

    // Anexos linkados à mensagem (uploads já feitos via signed PUT S3)
    if (input.attachments && input.attachments.length > 0) {
      await tx.ticketAttachment.createMany({
        data: input.attachments.slice(0, 10).map((a) => ({
          organizationId,
          ticketId,
          messageId: msg.id,
          filename: a.filename.slice(0, 255),
          contentType: a.contentType.slice(0, 200),
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
          uploadedById: actorUserId,
        })),
      });
    }

    await tx.ticketEvent.create({
      data: {
        organizationId,
        ticketId,
        actorUserId,
        type: 'message_added',
        payload: { messageId: msg.id, type: dbType, channel: resolvedChannel } as Prisma.InputJsonObject,
      },
    });

    if (!isInternal && !ticket.firstResponseAt) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }

    if (ticket.status === 'new') {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'in_progress' },
      });
      await tx.ticketEvent.create({
        data: {
          organizationId,
          ticketId,
          actorUserId,
          type: 'status_changed',
          payload: { from: 'new', to: 'in_progress', auto: true } as Prisma.InputJsonObject,
        },
      });
    }

    return msg;
  });

  await audit({
    organizationId,
    actorUserId,
    action: isInternal
      ? 'ticket.message.internal_note'
      : resolvedChannel === 'whatsapp'
        ? 'ticket.message.whatsapp_reply'
        : 'ticket.message.public_reply',
    resourceType: 'ticket',
    resourceId: ticketId,
    diff: { after: { messageId: message.id, type: dbType, channel: resolvedChannel } },
  });

  // Enfileira envio conforme canal
  if (!isInternal) {
    if (resolvedChannel === 'email') {
      const [hasGmail, hasSmtp] = await Promise.all([
        prisma.gmailConnection.findFirst({
          where: { organizationId, status: 'active', deletedAt: null },
          select: { id: true },
        }),
        prisma.imapSmtpConnection.findFirst({
          where: { organizationId, status: 'active', deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (!hasGmail && !hasSmtp) {
        await prisma.ticketMessage.update({
          where: { id: message.id },
          data: { deliveryStatus: 'not_applicable' },
        });
      } else {
        await enqueue({
          type: 'email.send',
          payload: { ticketMessageId: message.id },
          organizationId,
          dedupKey: `email.send:${message.id}`,
          maxAttempts: 3,
        });
      }
    } else if (resolvedChannel === 'whatsapp' && waConnectionId) {
      await enqueue({
        type: 'whatsapp.send',
        payload: { ticketMessageId: message.id },
        organizationId,
        dedupKey: `whatsapp.send:${message.id}`,
        maxAttempts: 3,
      });
    } else {
      await prisma.ticketMessage.update({
        where: { id: message.id },
        data: { deliveryStatus: 'not_applicable' },
      });
    }
  }

  // @menções em nota interna → notifica os usuários mencionados
  if (isInternal && input.body) {
    try {
      const { detectMentionedUsers, createNotification } = await import(
        '@/src/services/notifications'
      );
      const mentioned = await detectMentionedUsers(organizationId, input.body);
      const tickResolved = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { code: true, subject: true },
      });
      const actor = await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true },
      });
      for (const u of mentioned) {
        if (u.id === actorUserId) continue; // não notifica a si mesmo
        await createNotification({
          organizationId,
          userId: u.id,
          kind: 'mention',
          title: `${actor?.name ?? 'Alguém'} te mencionou em ${tickResolved?.code ?? 'um ticket'}`,
          body: input.body.slice(0, 200),
          link: tickResolved ? `/tickets/${tickResolved.code}` : undefined,
          actorUserId,
          resourceType: 'ticket',
          resourceId: ticketId,
        });
      }
    } catch {
      /* notificação não bloqueia */
    }
  }

  return { id: message.id, resolvedChannel };
}

async function resolveChannel(
  organizationId: string,
  ticket: { origin: string; requester: { email: string | null; phone: string | null } },
  requested: 'email' | 'whatsapp' | undefined,
): Promise<'email' | 'whatsapp' | 'none'> {
  // 1. Honra escolha explícita se viável
  if (requested === 'whatsapp' && ticket.requester.phone) return 'whatsapp';
  if (requested === 'email' && ticket.requester.email) return 'email';

  // 2. Origem do ticket é dica forte
  if (ticket.origin === 'whatsapp' && ticket.requester.phone) return 'whatsapp';
  if (ticket.origin === 'gmail' && ticket.requester.email) return 'email';

  // 3. Procura conexões ativas
  const hasWa = ticket.requester.phone
    ? await prisma.whatsappConnection.findFirst({
        where: { organizationId, status: 'active', deletedAt: null },
        select: { id: true },
      })
    : null;
  if (hasWa && ticket.requester.phone) return 'whatsapp';

  if (ticket.requester.email) {
    return 'email';
  }

  return 'none';
}
