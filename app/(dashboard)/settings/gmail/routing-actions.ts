'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import {
  createRule,
  deleteRule,
  toggleRule,
} from '@/src/services/gmail/routing';

const CreateInput = z.object({
  pattern: z.string().min(1).max(255),
  action: z.enum(['ignore', 'tag']),
  tagName: z.string().max(60).optional(),
  note: z.string().max(500).optional(),
});

export type RoutingState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | undefined;

export async function createRoutingRuleAction(
  _prev: RoutingState,
  form: FormData,
): Promise<RoutingState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');

  const parsed = CreateInput.safeParse({
    pattern: form.get('pattern'),
    action: form.get('action'),
    tagName: form.get('tagName') ?? undefined,
    note: form.get('note') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  try {
    const result = await createRule(ctx.organizationId, ctx.userId, {
      pattern: parsed.data.pattern,
      action: parsed.data.action,
      tagName: parsed.data.tagName,
      note: parsed.data.note,
    });
    revalidatePath('/settings/gmail');
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function toggleRoutingRuleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');
  const id = String(form.get('id') ?? '');
  const enabled = form.get('enabled') === 'true';
  if (!id) return;
  try {
    await toggleRule(ctx.organizationId, ctx.userId, id, enabled);
    revalidatePath('/settings/gmail');
  } catch {
    /* silencioso */
  }
}

export async function deleteRoutingRuleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'gmail:manage');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await deleteRule(ctx.organizationId, ctx.userId, id);
    revalidatePath('/settings/gmail');
  } catch {
    /* silencioso */
  }
}
