'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createLayout, deleteLayout, updateLayoutConfig } from '@/src/services/layouts';
import { LayoutConfigSchema, type LayoutConfig } from '@/src/services/layouts/schema';

const CreateInput = z.object({
  name: z.string().min(1).max(120),
});

export type CreateState = { ok: true; id: string } | { ok: false; error: string };

export async function createLayoutAction(
  _prev: CreateState | undefined,
  form: FormData,
): Promise<CreateState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:write');

  const parsed = CreateInput.safeParse({ name: form.get('name') });
  if (!parsed.success) return { ok: false, error: 'Nome inválido' };

  const emptyConfig: LayoutConfig = { blocks: [] };
  try {
    const created = await createLayout(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      config: emptyConfig,
    });
    revalidatePath('/layouts');
    redirect(`/layouts/${created.id}`);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const UpdateConfigInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  isDefault: z.coerce.boolean().optional(),
  configJson: z.string().min(2),
});

export async function updateLayoutAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:write');

  const parsed = UpdateConfigInput.parse({
    id: form.get('id'),
    name: form.get('name') ?? undefined,
    isDefault: form.get('isDefault') === 'on',
    configJson: form.get('configJson'),
  });

  let config: LayoutConfig;
  try {
    const raw = JSON.parse(parsed.configJson);
    config = LayoutConfigSchema.parse(raw);
  } catch (err) {
    throw new Error(`Config inválido: ${(err as Error).message}`);
  }

  await updateLayoutConfig(ctx.organizationId, ctx.userId, parsed.id, {
    name: parsed.name,
    isDefault: parsed.isDefault,
    config,
  });
  revalidatePath(`/layouts/${parsed.id}`);
  revalidatePath('/layouts');
}

const DeleteInput = z.object({ id: z.string().uuid() });

export async function deleteLayoutAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:write');

  const parsed = DeleteInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;

  await deleteLayout(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/layouts');
  redirect('/layouts');
}
