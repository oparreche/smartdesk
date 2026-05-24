import 'server-only';
import {
  Prisma,
  type TicketOrigin,
  type TicketPriority,
  type TicketStatus,
} from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { findOrCreateRequester, type RequesterInput } from '@/src/services/requesters/find-or-create';
import { audit } from '@/src/services/audit/log';
import { enqueue } from '@/src/services/jobs/enqueue';
import { listEnabledForEvent } from '@/src/services/integrations/run';
import { runRules } from '@/src/services/rules/run';
import { logger } from '@/src/lib/logger';
import { nextTicketCode } from './code';

export type CreateTicketInput = {
  subject: string;
  description?: string | null;
  origin: TicketOrigin;
  priority?: TicketPriority;
  status?: TicketStatus;
  queueId?: string | null;
  assigneeId?: string | null;
  customFields?: Record<string, unknown> | null;
  requester: RequesterInput;
};

export type CreatedTicket = {
  id: string;
  code: string;
  requesterId: string;
};

export async function createTicket(
  organizationId: string,
  actorUserId: string | null,
  input: CreateTicketInput,
): Promise<CreatedTicket> {
  const requester = await findOrCreateRequester(organizationId, input.requester);

  let queueId = input.queueId ?? null;
  if (!queueId) {
    const def = await prisma.queue.findFirst({
      where: { organizationId, isDefault: true, deletedAt: null },
      select: { id: true },
    });
    queueId = def?.id ?? null;
  }

  const code = await nextTicketCode(organizationId);

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        organizationId,
        code,
        requesterId: requester.id,
        assigneeId: input.assigneeId ?? null,
        queueId,
        subject: input.subject.trim(),
        description: input.description?.trim() || null,
        origin: input.origin,
        priority: input.priority ?? 'normal',
        status: input.status ?? 'new',
        customFields: input.customFields
          ? (JSON.parse(JSON.stringify(input.customFields)) as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
      select: { id: true, code: true, requesterId: true },
    });

    await tx.ticketEvent.create({
      data: {
        organizationId,
        ticketId: t.id,
        actorUserId,
        type: 'created',
        payload: {
          subject: input.subject,
          origin: input.origin,
          priority: input.priority ?? 'normal',
          status: input.status ?? 'new',
          queueId: queueId ?? null,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return t;
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'ticket.created',
    resourceType: 'ticket',
    resourceId: ticket.id,
    diff: { after: { code: ticket.code, subject: input.subject } },
  });

  // Dispara regras síncronas (set_priority/status/assign/tag) ANTES das integrações,
  // pra que dados básicos (prioridade, fila) estejam corretos quando o enrichment rodar.
  try {
    await runRules({
      organizationId,
      ticketId: ticket.id,
      trigger: input.origin === 'form' ? 'form_submitted' : 'ticket_created',
    });
  } catch (err) {
    logger.warn({ err, ticketId: ticket.id }, 'runRules on ticket_created failed (continuing)');
  }

  // Dispara integrações com triggerEvents incluindo "ticket.created" / "form.submitted"
  const triggerEvent = input.origin === 'form' ? 'form.submitted' : 'ticket.created';
  const integrations = await listEnabledForEvent(organizationId, triggerEvent);
  for (const integration of integrations) {
    await enqueue({
      type: 'integration.run',
      payload: {
        organizationId,
        integrationId: integration.id,
        ticketId: ticket.id,
        triggeredBy: triggerEvent,
      },
      organizationId,
      maxAttempts: integration.maxRetries + 1,
    });
  }
  // Também dispara as registradas em ticket.created (caso a origem seja form e a integração só queira ticket.created)
  if (triggerEvent === 'form.submitted') {
    const also = await listEnabledForEvent(organizationId, 'ticket.created');
    const seen = new Set(integrations.map((i) => i.id));
    for (const integration of also) {
      if (seen.has(integration.id)) continue;
      await enqueue({
        type: 'integration.run',
        payload: {
          organizationId,
          integrationId: integration.id,
          ticketId: ticket.id,
          triggeredBy: 'ticket.created',
        },
        organizationId,
        maxAttempts: integration.maxRetries + 1,
      });
    }
  }

  // Análise de sentimento em background — não bloqueia criação
  void (async () => {
    try {
      const { analyzeTicketSentiment } = await import('@/src/services/ai/sentiment');
      await analyzeTicketSentiment(organizationId, ticket.id);
    } catch (err) {
      logger.warn({ err, ticketId: ticket.id }, 'sentiment analysis failed (continuing)');
    }
  })();

  // Webhook outbound — ticket.created
  try {
    const { dispatchEvent } = await import('@/src/services/webhooks');
    await dispatchEvent({
      organizationId,
      event: 'ticket.created',
      payload: {
        ticket: {
          id: ticket.id,
          code: ticket.code,
          subject: input.subject,
          origin: input.origin,
          priority: input.priority ?? 'normal',
          status: input.status ?? 'new',
        },
        requester: input.requester,
      },
    });
  } catch (err) {
    logger.warn({ err, ticketId: ticket.id }, 'webhook dispatch failed');
  }

  return ticket;
}
