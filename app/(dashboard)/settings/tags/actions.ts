'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createTag, deleteTag } from '@/src/services/tags';

const CreateInput = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}){1,2}$/)
    .optional()
    .or(z.literal('')),
});

const DeleteInput = z.object({ id: z.string().uuid() });

export type TagFormState = { ok: true } | { ok: false; error: string };

export async function createTagAction(
  _prev: TagFormState | undefined,
  formData: FormData,
): Promise<TagFormState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tags:manage');

  const parsed = CreateInput.safeParse({
    name: formData.get('name'),
    color: formData.get('color') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  try {
    await createTag(ctx.organizationId, ctx.userId, {
      name: parsed.data.name,
      color: parsed.data.color || null,
    });
    revalidatePath('/settings/tags');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteTagAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tags:manage');

  const parsed = DeleteInput.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  await deleteTag(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/settings/tags');
}
