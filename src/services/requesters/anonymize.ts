import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

/**
 * Anonimiza um requester (LGPD): nullea PII mas preserva o registro para que
 * tickets/audit não fiquem órfãos.
 *
 * O que é apagado:
 *  - email, phone, document, name, externalId, customFields
 *  - emails inbound de ticket_messages associados (PII em headers/body)
 *
 * O que fica:
 *  - id do requester (referência em tickets)
 *  - estrutura dos tickets/eventos/audit_logs (sem o conteúdo de mensagens)
 *  - audit_log da anonimização (com email original mascarado)
 */
export async function anonymizeRequester(
  organizationId: string,
  actorUserId: string,
  requesterId: string,
): Promise<{ ticketCount: number; messageCount: number }> {
  const requester = await prisma.requester.findFirst({
    where: { id: requesterId, organizationId },
    select: { id: true, email: true, name: true, document: true },
  });
  if (!requester) throw new Error('Requester não encontrado');

  const result = await prisma.$transaction(async (tx) => {
    // Conta tickets/mensagens antes
    const ticketCount = await tx.ticket.count({
      where: { organizationId, requesterId },
    });
    const ticketIds = await tx.ticket.findMany({
      where: { organizationId, requesterId },
      select: { id: true },
    });
    const messageUpdate = await tx.ticketMessage.updateMany({
      where: {
        organizationId,
        ticketId: { in: ticketIds.map((t) => t.id) },
        OR: [{ type: 'incoming_email' }, { authorRequester: requesterId }],
      },
      data: {
        bodyText: '[anonimizado]',
        bodyHtml: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
      },
    });

    await tx.requester.update({
      where: { id: requesterId },
      data: {
        email: null,
        phone: null,
        document: null,
        name: 'Solicitante anonimizado',
        externalId: null,
        customFields: undefined,
        deletedAt: new Date(),
      },
    });

    return { ticketCount, messageCount: messageUpdate.count };
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'requester.anonymized',
    resourceType: 'requester',
    resourceId: requesterId,
    diff: {
      before: {
        emailMasked: requester.email ? maskEmail(requester.email) : null,
        name: requester.name,
      },
      after: { ticketsPreserved: result.ticketCount, messagesAnonymized: result.messageCount },
    },
  });

  return result;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
