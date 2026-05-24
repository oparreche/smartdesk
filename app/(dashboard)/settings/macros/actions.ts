'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import {
  createMacro,
  updateMacro,
  deleteMacro,
  bumpUsage,
  applyMacroActions,
} from '@/src/services/macros';
import { ActionSchema } from '@/src/services/rules/schema';

const ActionsField = z.string().optional();

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  shortcut: z.string().max(40).optional(),
  body: z.string().min(1).max(20_000),
  enabled: z.string().optional().transform((v) => v !== 'false'),
  actionsJson: ActionsField,
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  shortcut: z.string().max(40).optional(),
  body: z.string().min(1).max(20_000),
  enabled: z.string().optional().transform((v) => v === 'on' || v === 'true'),
  actionsJson: ActionsField,
});

export type MacroState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | undefined;

function parseActions(json: string | undefined) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return z.array(ActionSchema).max(10).parse(arr);
  } catch {
    throw new Error('Ações inválidas');
  }
}

export async function createMacroAction(
  _prev: MacroState,
  form: FormData,
): Promise<MacroState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = CreateInput.safeParse({
    name: form.get('name'),
    shortcut: form.get('shortcut') || undefined,
    body: form.get('body'),
    enabled: form.get('enabled') ?? undefined,
    actionsJson: form.get('actionsJson') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Inválido' };

  try {
    const actions = parseActions(parsed.data.actionsJson);
    const result = await createMacro(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      shortcut: parsed.data.shortcut?.trim() || null,
      body: parsed.data.body,
      enabled: parsed.data.enabled,
      actions,
    });
    revalidatePath('/settings/macros');
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateMacroAction(
  _prev: MacroState,
  form: FormData,
): Promise<MacroState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = UpdateInput.safeParse({
    id: form.get('id'),
    name: form.get('name'),
    shortcut: form.get('shortcut') || undefined,
    body: form.get('body'),
    enabled: form.get('enabled') ?? undefined,
    actionsJson: form.get('actionsJson') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Inválido' };

  try {
    const actions = parseActions(parsed.data.actionsJson);
    await updateMacro(ctx.organizationId, ctx.userId, parsed.data.id, {
      name: parsed.data.name,
      shortcut: parsed.data.shortcut?.trim() || null,
      body: parsed.data.body,
      enabled: parsed.data.enabled,
      actions,
    });
    revalidatePath('/settings/macros');
    revalidatePath(`/settings/macros/${parsed.data.id}`);
    return { ok: true, id: parsed.data.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteMacroAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await deleteMacro(ctx.organizationId, ctx.userId, id);
  } catch {
    /* noop */
  }
  revalidatePath('/settings/macros');
  if (form.get('redirect') === '1') redirect('/settings/macros');
}

const ApplyInput = z.object({
  macroId: z.string().uuid(),
  ticketId: z.string().uuid(),
});

const BumpInput = z.object({ macroId: z.string().uuid() });

export async function bumpMacroUsageAction(
  input: z.infer<typeof BumpInput>,
): Promise<void> {
  const parsed = BumpInput.safeParse(input);
  if (!parsed.success) return;
  await bumpUsage(parsed.data.macroId);
}

/**
 * Aplica as ações de uma macro a um ticket (mudar status, tag, etc.).
 * Body já vai pelo composer normal; aqui é só pra triggers.
 */
export async function applyMacroToTicketAction(
  input: z.infer<typeof ApplyInput>,
): Promise<{ ok: boolean; applied?: number; error?: string }> {
  const ctx = await getOrgContext();
  const parsed = ApplyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'inválido' };

  const { prisma } = await import('@/src/lib/prisma');
  const macro = await prisma.macro.findFirst({
    where: {
      id: parsed.data.macroId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      enabled: true,
    },
    select: { id: true, actions: true },
  });
  if (!macro) return { ok: false, error: 'macro_not_found' };

  const actionsArr = z
    .array(ActionSchema)
    .max(10)
    .safeParse(macro.actions);
  if (!actionsArr.success) return { ok: false, error: 'invalid_actions' };

  const result = await applyMacroActions(
    ctx.organizationId,
    ctx.userId,
    parsed.data.ticketId,
    actionsArr.data,
  );
  await bumpUsage(parsed.data.macroId);
  return { ok: true, applied: result.applied };
}
