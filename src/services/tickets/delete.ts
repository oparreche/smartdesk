import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

export class TicketNotFoundError extends Error {
  constructor() {
    super('Ticket não encontrado');
    this.name = 'TicketNotFoundError';
  }
}

/**
 * Soft delete: marca `deletedAt`. O ticket some das listagens (que filtram
 * `deletedAt: null`) mas continua no banco com todo histórico — recuperável
 * por uma futura tela de lixeira. Exclusão permanente fica reservada a
 * `tickets:delete` (admin/owner) quando a lixeira for implementada.
 *
 * Registra `ticket.deleted` no audit log (não há TicketEventType próprio e o
 * ticket sai das telas de qualquer forma).
 */
export async function softDeleteTicket(
  organizationId: string,
  actorUserId: string,
  ticketId: string,
): Promise<{ code: string }> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: { id: true, code: true, subject: true, status: true },
  });
  if (!ticket) throw new TicketNotFoundError();

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { deletedAt: new Date() },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'ticket.deleted',
    resourceType: 'ticket',
    resourceId: ticket.id,
    diff: { before: { code: ticket.code, subject: ticket.subject, status: ticket.status } },
  });

  return { code: ticket.code };
}
