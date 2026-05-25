'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createRule, updateRule, deleteRule, setRuleEnabled } from '@/src/services/rules/crud';
import { RuleDefinitionSchema } from '@/src/services/rules/schema';

export type CreateState = { ok: true; id: string } | { ok: false; error: string };

const SimpleCreateInput = z.object({
  name: z.string().min(1).max(120),
  trigger: z.enum(['ticket_created', 'ticket_updated', 'ticket_enriched', 'email_received', 'form_submitted']),
});

export async function createRuleAction(
  _prev: CreateState | undefined,
  form: FormData,
): Promise<CreateState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = SimpleCreateInput.safeParse({
    name: form.get('name'),
    trigger: form.get('trigger'),
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos' };

  try {
    const created = await createRule(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      enabled: true,
      conditions: undefined,
      actions: [{ type: 'add_tag', value: 'auto' }],
      runOrder: 0,
      stopAfterMatch: false,
    });
    revalidatePath('/rules');
    redirect(`/rules/${created.id}`);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  definitionJson: z.string().min(2),
});

export async function updateRuleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = UpdateInput.parse({
    id: form.get('id'),
    definitionJson: form.get('definitionJson'),
  });

  let parsedDef;
  try {
    parsedDef = RuleDefinitionSchema.parse(JSON.parse(parsed.definitionJson));
  } catch (err) {
    throw new Error(`Definição inválida: ${(err as Error).message}`);
  }

  await updateRule(ctx.organizationId, ctx.userId, parsed.id, parsedDef);
  revalidatePath(`/rules/${parsed.id}`);
  revalidatePath('/rules');
}

const DeleteInput = z.object({ id: z.string().uuid() });

export async function deleteRuleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = DeleteInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await deleteRule(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/rules');
  redirect('/rules');
}

const ToggleInput = z.object({
  id: z.string().uuid(),
  enabled: z.union([z.literal('true'), z.literal('false')]),
});

/** Liga/desliga uma regra direto da lista (sem redirect). */
export async function toggleRuleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = ToggleInput.safeParse({ id: form.get('id'), enabled: form.get('enabled') });
  if (!parsed.success) return;
  await setRuleEnabled(ctx.organizationId, ctx.userId, parsed.data.id, parsed.data.enabled === 'true');
  revalidatePath('/rules');
}

/** Exclui a partir da lista (sem redirect, só revalida). */
export async function deleteRuleFromListAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = DeleteInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await deleteRule(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/rules');
}
