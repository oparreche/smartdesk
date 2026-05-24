import 'server-only';
import {
  Prisma,
  type TicketStatus,
  type TicketPriority,
} from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';
import { runRules } from '@/src/services/rules/run';
import { logger } from '@/src/lib/logger';

export type TicketUpdateInput = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string | null; // null = unassign
  queueId?: string | null;
};

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ['open', 'in_progress', 'cancelled'],
  open: ['in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'cancelled'],
  in_progress: ['open', 'pending_customer', 'pending_third_party', 'resolved', 'cancelled'],
  pending_customer: ['open', 'in_progress', 'resolved', 'cancelled'],
  pending_third_party: ['open', 'in_progress', 'resolved', 'cancelled'],
  resolved: ['open', 'closed'],
  closed: ['open'],
  cancelled: ['open'],
};

export class InvalidStatusTransitionError extends Error {
  constructor(public from: TicketStatus, public to: TicketStatus) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export async function updateTicket(
  organizationId: string,
  actorUserId: string,
  ticketId: string,
  input: TicketUpdateInput,
): Promise<void> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: {
      id: true,
      code: true,
      status: true,
      priority: true,
      assigneeId: true,
      queueId: true,
      firstResponseAt: true,
      resolvedAt: true,
      closedAt: true,
    },
  });
  if (!ticket) throw new Error('Ticket não encontrado');

  if (input.status && input.status !== ticket.status) {
    const allowed = VALID_TRANSITIONS[ticket.status];
    if (!allowed.includes(input.status)) {
      throw new InvalidStatusTransitionError(ticket.status, input.status);
    }
  }

  const data: Prisma.TicketUpdateInput = {};
  const events: { type: 'status_changed' | 'priority_changed' | 'assignee_changed' | 'queue_changed'; payload: Prisma.InputJsonObject }[] = [];

  if (input.status && input.status !== ticket.status) {
    data.status = input.status;
    events.push({
      type: 'status_changed',
      payload: { from: ticket.status, to: input.status },
    });
    if (input.status === 'resolved' && !ticket.resolvedAt) {
      data.resolvedAt = new Date();
    }
    if (input.status === 'closed' && !ticket.closedAt) {
      data.closedAt = new Date();
    }
  }

  if (input.priority && input.priority !== ticket.priority) {
    data.priority = input.priority;
    events.push({
      type: 'priority_changed',
      payload: { from: ticket.priority, to: input.priority },
    });
  }

  if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
    data.assignee = input.assigneeId
      ? { connect: { id: input.assigneeId } }
      : { disconnect: true };
    events.push({
      type: 'assignee_changed',
      payload: { from: ticket.assigneeId ?? null, to: input.assigneeId ?? null },
    });
  }

  if (input.queueId !== undefined && input.queueId !== ticket.queueId) {
    data.queue = input.queueId
      ? { connect: { id: input.queueId } }
      : { disconnect: true };
    events.push({
      type: 'queue_changed',
      payload: { from: ticket.queueId ?? null, to: input.queueId ?? null },
    });
  }

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticket.id }, data });
    if (events.length) {
      await tx.ticketEvent.createMany({
        data: events.map((e) => ({
          organizationId,
          ticketId: ticket.id,
          actorUserId,
          type: e.type,
          payload: e.payload,
        })),
      });
    }
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'ticket.updated',
    resourceType: 'ticket',
    resourceId: ticket.id,
    diff: {
      before: {
        status: ticket.status,
        priority: ticket.priority,
        assigneeId: ticket.assigneeId,
        queueId: ticket.queueId,
      },
      after: input,
    },
  });

  // CSAT: quando ticket transita pra resolved/closed, dispara pesquisa pro requester
  if (
    input.status &&
    input.status !== ticket.status &&
    (input.status === 'resolved' || input.status === 'closed')
  ) {
    try {
      const { createAndSendCsat } = await import('@/src/services/csat');
      await createAndSendCsat({ organizationId, ticketId: ticket.id });
    } catch (err) {
      const { logger } = await import('@/src/lib/logger');
      logger.warn({ err, ticketId: ticket.id }, 'csat trigger failed (continuing)');
    }
  }

  // Webhooks outbound
  try {
    const { dispatchEvent } = await import('@/src/services/webhooks');
    const basePayload = {
      ticket: { id: ticket.id, code: ticket.code },
      changes: input,
    };
    await dispatchEvent({
      organizationId,
      event: 'ticket.updated',
      payload: basePayload,
    });
    if (input.status && input.status !== ticket.status) {
      await dispatchEvent({
        organizationId,
        event: 'ticket.status_changed',
        payload: {
          ...basePayload,
          from: ticket.status,
          to: input.status,
        },
      });
      if (input.status === 'closed' || input.status === 'resolved') {
        await dispatchEvent({
          organizationId,
          event: 'ticket.closed',
          payload: { ...basePayload, status: input.status },
        });
      }
    }
    if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
      await dispatchEvent({
        organizationId,
        event: 'ticket.assigned',
        payload: {
          ...basePayload,
          from: ticket.assigneeId,
          to: input.assigneeId,
        },
      });
    }
  } catch {
    /* webhook não bloqueia update */
  }

  // Dispara regras "ticket_updated" — guard para não recursar:
  // se a chamada vem de uma regra, o `actorUserId` pode ser de uma regra. Em vez disso,
  // usamos um flag implícito: setado por ações de regras é fácil identificar pelo
  // payload do TicketEvent. No MVP, aceitamos uma única passada — runRules NÃO chama
  // updateTicket (ações chamam prisma diretamente), então não há recursão.
  try {
    await runRules({
      organizationId,
      ticketId: ticket.id,
      trigger: 'ticket_updated',
    });
  } catch (err) {
    logger.warn({ err, ticketId: ticket.id }, 'runRules on ticket_updated failed (continuing)');
  }
}
