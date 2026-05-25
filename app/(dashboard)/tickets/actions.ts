'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { can, requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { updateTicket, InvalidStatusTransitionError } from '@/src/services/tickets/update';
import {
  createSavedFilter,
  deleteSavedFilter,
} from '@/src/services/saved-filters';
import { createRule } from '@/src/services/rules/crud';
import { softDeleteTicket, TicketNotFoundError } from '@/src/services/tickets/delete';
import type { Action } from '@/src/services/rules/schema';
import type { TicketStatus } from '@prisma/client';

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  paramsJson: z.string().max(8000),
  shared: z
    .string()
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export type SavedFilterState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | undefined;

export async function createSavedFilterAction(
  _prev: SavedFilterState,
  formData: FormData,
): Promise<SavedFilterState> {
  const ctx = await getOrgContext();
  const parsed = CreateInput.safeParse({
    name: formData.get('name'),
    paramsJson: formData.get('paramsJson') ?? '{}',
    shared: formData.get('shared') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  // Compartilhado exige permissão de admin/owner
  const shared = parsed.data.shared && can(ctx.role, 'organization:manage');

  let params: unknown;
  try {
    params = JSON.parse(parsed.data.paramsJson);
  } catch {
    return { ok: false, error: 'Filtro inválido.' };
  }

  try {
    const result = await createSavedFilter(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      resource: 'tickets',
      params,
      shared,
    });
    revalidatePath('/tickets');
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteSavedFilterAction(formData: FormData) {
  const ctx = await getOrgContext();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  try {
    await deleteSavedFilter(ctx.organizationId, ctx.userId, id);
  } catch {
    /* já registrado em audit / volta silencioso */
  }
  revalidatePath('/tickets');
}

/** Salva preferência de view (lista/kanban) do usuário. */
export async function setTicketViewPrefAction(view: 'list' | 'kanban'): Promise<void> {
  const ctx = await getOrgContext();
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { defaultTicketView: view },
  });
  revalidatePath('/tickets');
}

const MoveInput = z.object({
  ticketId: z.string().uuid(),
  status: z.enum([
    'new', 'open', 'in_progress', 'pending_customer', 'pending_third_party',
    'resolved', 'closed', 'cancelled',
  ]),
});

export type MoveState = { ok: true } | { ok: false; error: string };

/** Drag-and-drop no kanban: move ticket pra outra coluna. */
export async function moveTicketAction(input: { ticketId: string; status: string }): Promise<MoveState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:update');
  const parsed = MoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Status inválido' };
  try {
    await updateTicket(ctx.organizationId, ctx.userId, parsed.data.ticketId, {
      status: parsed.data.status as TicketStatus,
    });
    revalidatePath('/tickets');
    return { ok: true };
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return { ok: false, error: 'Transição de status inválida' };
    }
    return { ok: false, error: (err as Error).message };
  }
}

const PriorityValues = ['low', 'normal', 'high', 'urgent', 'critical'] as const;

const RoutingRuleInput = z.object({
  ticketId: z.string().uuid(),
  matchBy: z.enum(['email', 'phone']),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('assign_queue'), queueSlug: z.string().min(1).max(60) }),
    z.object({ type: z.literal('assign_user'), email: z.string().email() }),
    z.object({ type: z.literal('set_priority'), value: z.enum(PriorityValues) }),
    z.object({ type: z.literal('add_tag'), value: z.string().min(1).max(60) }),
  ]),
  stopAfterMatch: z.boolean().optional(),
});

export type RoutingRuleState =
  | { ok: true; ruleId: string; matchValue: string }
  | { ok: false; error: string };

/**
 * Cria uma regra de roteamento a partir de um ticket: casa futuros tickets do
 * mesmo solicitante (por email ou telefone) e aplica uma ação. Disponível para
 * qualquer pessoa que possa editar tickets — não exige `rules:write`.
 *
 * O valor do match é lido do ticket no servidor (não confia no cliente).
 */
export async function createRoutingRuleFromTicketAction(
  input: z.input<typeof RoutingRuleInput>,
): Promise<RoutingRuleState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:update');

  const parsed = RoutingRuleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  const ticket = await prisma.ticket.findFirst({
    where: { id: parsed.data.ticketId, organizationId: ctx.organizationId, deletedAt: null },
    select: { requester: { select: { email: true, phone: true } } },
  });
  if (!ticket) return { ok: false, error: 'Ticket não encontrado.' };

  const matchValue =
    parsed.data.matchBy === 'email' ? ticket.requester.email : ticket.requester.phone;
  if (!matchValue) {
    return {
      ok: false,
      error: parsed.data.matchBy === 'email'
        ? 'O solicitante não tem email cadastrado.'
        : 'O solicitante não tem telefone cadastrado.',
    };
  }

  const field = parsed.data.matchBy === 'email' ? 'ticket.requester.email' : 'ticket.requester.phone';

  try {
    const created = await createRule(ctx.organizationId, ctx.userId, {
      name: `Roteamento • ${matchValue}`.slice(0, 120),
      trigger: 'ticket_created',
      enabled: true,
      conditions: { field, op: 'eq', value: matchValue },
      actions: [parsed.data.action as Action],
      runOrder: 0,
      stopAfterMatch: parsed.data.stopAfterMatch ?? false,
    });
    revalidatePath('/rules');
    revalidatePath('/tickets');
    return { ok: true, ruleId: created.id, matchValue };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type DeleteTicketState = { ok: true } | { ok: false; error: string };

/**
 * Soft delete de ticket a partir da lista/kanban/detalhe.
 * Liberado para quem pode editar tickets (`tickets:update`).
 */
export async function deleteTicketAction(input: { ticketId: string }): Promise<DeleteTicketState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:update');

  const parsed = z.object({ ticketId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Ticket inválido.' };

  try {
    await softDeleteTicket(ctx.organizationId, ctx.userId, parsed.data.ticketId);
    revalidatePath('/tickets');
    return { ok: true };
  } catch (err) {
    if (err instanceof TicketNotFoundError) return { ok: false, error: 'Ticket não encontrado.' };
    return { ok: false, error: (err as Error).message };
  }
}
