import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/lib/prisma';
import { logger } from '@/src/lib/logger';
import { renderTemplate } from '@/src/services/integrations/template';
import type { Action } from './schema';

export type ActionExecutionContext = {
  organizationId: string;
  ticketId: string;
  ruleId: string;
  ruleName: string;
  /** Context para renderizar templates (mesmo que `runIntegration` recebe). */
  ctx: Record<string, unknown>;
};

export type ActionResult = { ok: true; summary: string } | { ok: false; error: string };

/**
 * Executa uma ação contra um ticket. Cada ação é idempotente quando possível
 * (set_priority não muda se já é o valor; add_tag não duplica; etc.).
 */
export async function executeAction(
  action: Action,
  ctx: ActionExecutionContext,
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'set_priority':
        return await setPriority(ctx, action.value);
      case 'set_status':
        return await setStatus(ctx, action.value);
      case 'add_tag':
        return await addTag(ctx, action.value);
      case 'remove_tag':
        return await removeTag(ctx, action.value);
      case 'assign_queue':
        return await assignQueue(ctx, action.queueSlug);
      case 'assign_user':
        return await assignUser(ctx, action.email);
      case 'assign_round_robin':
        return await assignRoundRobin(ctx, action.queueSlug, action.balanceByWorkload ?? true);
      case 'add_internal_note':
        return await addInternalNote(ctx, action.body);
      case 'add_alert':
        return await addAlert(ctx, action.variant, action.message);
    }
  } catch (err) {
    logger.warn({ err, action: action.type, ticketId: ctx.ticketId }, 'rule action failed');
    return { ok: false, error: (err as Error).message };
  }
}

async function setPriority(ctx: ActionExecutionContext, value: 'low' | 'normal' | 'high' | 'urgent' | 'critical'): Promise<ActionResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ctx.ticketId },
    select: { priority: true },
  });
  if (!ticket) return { ok: false, error: 'ticket_not_found' };
  if (ticket.priority === value) return { ok: true, summary: `prioridade já era ${value}` };

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ctx.ticketId }, data: { priority: value } }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'priority_changed',
        payload: {
          from: ticket.priority,
          to: value,
          by: 'rule',
          ruleId: ctx.ruleId,
          ruleName: ctx.ruleName,
        } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `${ticket.priority} → ${value}` };
}

async function setStatus(ctx: ActionExecutionContext, value: 'new' | 'open' | 'in_progress' | 'pending_customer' | 'pending_third_party' | 'resolved' | 'closed' | 'cancelled'): Promise<ActionResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ctx.ticketId },
    select: { status: true },
  });
  if (!ticket) return { ok: false, error: 'ticket_not_found' };
  if (ticket.status === value) return { ok: true, summary: `status já era ${value}` };

  const updateData: Prisma.TicketUpdateInput = { status: value };
  if (value === 'resolved') updateData.resolvedAt = new Date();
  if (value === 'closed') updateData.closedAt = new Date();

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ctx.ticketId }, data: updateData }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'status_changed',
        payload: {
          from: ticket.status,
          to: value,
          by: 'rule',
          ruleId: ctx.ruleId,
          ruleName: ctx.ruleName,
        } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `${ticket.status} → ${value}` };
}

async function addTag(ctx: ActionExecutionContext, tagName: string): Promise<ActionResult> {
  const name = tagName.trim();
  if (!name) return { ok: false, error: 'tag_name_empty' };

  let tag = await prisma.tag.findFirst({
    where: { organizationId: ctx.organizationId, name },
    select: { id: true },
  });
  if (!tag) {
    tag = await prisma.tag.create({
      data: { organizationId: ctx.organizationId, name },
      select: { id: true },
    });
  }

  const existing = await prisma.ticketTag.findFirst({
    where: { ticketId: ctx.ticketId, tagId: tag.id },
    select: { ticketId: true },
  });
  if (existing) return { ok: true, summary: `tag ${name} já presente` };

  await prisma.$transaction([
    prisma.ticketTag.create({ data: { ticketId: ctx.ticketId, tagId: tag.id } }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'tag_added',
        payload: { tag: name, by: 'rule', ruleId: ctx.ruleId, ruleName: ctx.ruleName } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `+ ${name}` };
}

async function removeTag(ctx: ActionExecutionContext, tagName: string): Promise<ActionResult> {
  const name = tagName.trim();
  const tag = await prisma.tag.findFirst({
    where: { organizationId: ctx.organizationId, name },
    select: { id: true },
  });
  if (!tag) return { ok: true, summary: `tag ${name} não existe` };

  const existing = await prisma.ticketTag.findFirst({
    where: { ticketId: ctx.ticketId, tagId: tag.id },
    select: { ticketId: true },
  });
  if (!existing) return { ok: true, summary: `tag ${name} não estava no ticket` };

  await prisma.$transaction([
    prisma.ticketTag.delete({
      where: { ticketId_tagId: { ticketId: ctx.ticketId, tagId: tag.id } },
    }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'tag_removed',
        payload: { tag: name, by: 'rule', ruleId: ctx.ruleId, ruleName: ctx.ruleName } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `- ${name}` };
}

async function assignQueue(ctx: ActionExecutionContext, queueSlug: string): Promise<ActionResult> {
  const queue = await prisma.queue.findFirst({
    where: { organizationId: ctx.organizationId, slug: queueSlug, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!queue) return { ok: false, error: `fila ${queueSlug} não encontrada` };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ctx.ticketId },
    select: { queueId: true },
  });
  if (!ticket) return { ok: false, error: 'ticket_not_found' };
  if (ticket.queueId === queue.id) return { ok: true, summary: `já estava na fila ${queue.name}` };

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ctx.ticketId }, data: { queueId: queue.id } }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'queue_changed',
        payload: {
          from: ticket.queueId,
          to: queue.id,
          queueName: queue.name,
          by: 'rule',
          ruleId: ctx.ruleId,
          ruleName: ctx.ruleName,
        } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `fila → ${queue.name}` };
}

async function assignUser(ctx: ActionExecutionContext, email: string): Promise<ActionResult> {
  const user = await prisma.user.findFirst({
    where: {
      email,
      deletedAt: null,
      memberships: {
        some: {
          organizationId: ctx.organizationId,
          status: 'active',
          role: { in: ['owner', 'admin', 'supervisor', 'agent'] },
        },
      },
    },
    select: { id: true, name: true },
  });
  if (!user) return { ok: false, error: `usuário ${email} não é membro ativo` };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ctx.ticketId },
    select: { assigneeId: true },
  });
  if (!ticket) return { ok: false, error: 'ticket_not_found' };
  if (ticket.assigneeId === user.id) return { ok: true, summary: `já atribuído a ${user.name}` };

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ctx.ticketId }, data: { assigneeId: user.id } }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'assignee_changed',
        payload: {
          from: ticket.assigneeId,
          to: user.id,
          by: 'rule',
          ruleId: ctx.ruleId,
          ruleName: ctx.ruleName,
        } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `atribuído a ${user.name}` };
}

async function assignRoundRobin(
  ctx: ActionExecutionContext,
  queueSlug: string | undefined,
  balanceByWorkload: boolean,
): Promise<ActionResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ctx.ticketId },
    select: { assigneeId: true, queueId: true, organizationId: true },
  });
  if (!ticket) return { ok: false, error: 'ticket_not_found' };
  if (ticket.assigneeId) {
    return { ok: true, summary: 'já tem responsável, pulando rodízio' };
  }

  // Resolve a fila: explícita por slug, ou a do ticket
  let queueId = ticket.queueId;
  if (queueSlug) {
    const q = await prisma.queue.findFirst({
      where: { organizationId: ctx.organizationId, slug: queueSlug, deletedAt: null },
      select: { id: true },
    });
    if (!q) return { ok: false, error: `fila ${queueSlug} não encontrada` };
    queueId = q.id;
  }
  if (!queueId) {
    return { ok: false, error: 'ticket sem fila e queueSlug não informado' };
  }

  // Pega membros ativos da org que sejam agentes (futuro: membership por fila)
  const candidates = await prisma.organizationUser.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: 'active',
      role: { in: ['owner', 'admin', 'supervisor', 'agent'] },
      user: { deletedAt: null },
    },
    select: { userId: true, user: { select: { id: true, name: true } } },
  });
  if (candidates.length === 0) {
    return { ok: false, error: 'sem agentes ativos pra atribuir' };
  }

  let pickedUserId: string;
  let reason: string;

  if (balanceByWorkload) {
    // Conta tickets abertos por agente
    const counts = await prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: {
        organizationId: ctx.organizationId,
        deletedAt: null,
        status: { in: ['new', 'open', 'in_progress', 'pending_customer', 'pending_third_party'] },
        assigneeId: { in: candidates.map((c) => c.userId) },
      },
      _count: { _all: true },
    });
    const workload = new Map<string, number>();
    for (const c of candidates) workload.set(c.userId, 0);
    for (const c of counts) {
      if (c.assigneeId) workload.set(c.assigneeId, c._count._all);
    }
    // Ordena por workload asc, desempate alfabético pra ser determinístico
    const sorted = candidates.sort((a, b) => {
      const wa = workload.get(a.userId) ?? 0;
      const wb = workload.get(b.userId) ?? 0;
      if (wa !== wb) return wa - wb;
      return (a.user.name ?? '').localeCompare(b.user.name ?? '');
    });
    pickedUserId = sorted[0].userId;
    reason = `workload ${workload.get(pickedUserId) ?? 0}`;
  } else {
    // Rodízio puro: pega o agente que recebeu a atribuição mais antiga (ou nunca recebeu)
    const lastAssigns = await prisma.ticketEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        type: 'assignee_changed',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { createdAt: true, payload: true },
    });
    const lastBy = new Map<string, Date>();
    for (const e of lastAssigns) {
      const to = (e.payload as { to?: string } | null)?.to;
      if (to && !lastBy.has(to)) lastBy.set(to, e.createdAt);
    }
    const sorted = candidates.sort((a, b) => {
      const la = lastBy.get(a.userId)?.getTime() ?? 0;
      const lb = lastBy.get(b.userId)?.getTime() ?? 0;
      return la - lb;
    });
    pickedUserId = sorted[0].userId;
    reason = 'last_assigned';
  }

  const picked = candidates.find((c) => c.userId === pickedUserId);

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ctx.ticketId },
      data: { assigneeId: pickedUserId },
    }),
    prisma.ticketEvent.create({
      data: {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        type: 'assignee_changed',
        payload: {
          from: null,
          to: pickedUserId,
          by: 'round_robin',
          reason,
          ruleId: ctx.ruleId,
          ruleName: ctx.ruleName,
        } as Prisma.InputJsonObject,
      },
    }),
  ]);
  return { ok: true, summary: `round-robin → ${picked?.user.name ?? pickedUserId}` };
}

async function addInternalNote(ctx: ActionExecutionContext, body: string): Promise<ActionResult> {
  const rendered = renderTemplate(body, ctx.ctx);
  const msg = await prisma.ticketMessage.create({
    data: {
      organizationId: ctx.organizationId,
      ticketId: ctx.ticketId,
      type: 'internal_note',
      bodyText: `[Regra "${ctx.ruleName}"] ${rendered}`,
      deliveryStatus: 'not_applicable',
    },
    select: { id: true },
  });
  await prisma.ticketEvent.create({
    data: {
      organizationId: ctx.organizationId,
      ticketId: ctx.ticketId,
      type: 'message_added',
      payload: {
        messageId: msg.id,
        type: 'internal_note',
        by: 'rule',
        ruleId: ctx.ruleId,
        ruleName: ctx.ruleName,
      } as Prisma.InputJsonObject,
    },
  });
  return { ok: true, summary: 'nota adicionada' };
}

async function addAlert(
  ctx: ActionExecutionContext,
  variant: 'info' | 'success' | 'warning' | 'destructive',
  message: string,
): Promise<ActionResult> {
  const rendered = renderTemplate(message, ctx.ctx);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ctx.ticketId },
    select: { customFields: true },
  });
  if (!ticket) return { ok: false, error: 'ticket_not_found' };

  const cf = (ticket.customFields as Record<string, unknown> | null) ?? {};
  const alerts = Array.isArray(cf._alerts) ? (cf._alerts as Array<unknown>) : [];
  const next = [...alerts, { variant, message: rendered, ruleId: ctx.ruleId, addedAt: new Date().toISOString() }];

  await prisma.ticket.update({
    where: { id: ctx.ticketId },
    data: {
      customFields: { ...cf, _alerts: next } as Prisma.InputJsonObject,
    },
  });
  return { ok: true, summary: `alerta ${variant} adicionado` };
}
