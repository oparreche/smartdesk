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
