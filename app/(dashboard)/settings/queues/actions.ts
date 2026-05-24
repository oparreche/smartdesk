'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createQueue, updateQueue, deleteQueue } from '@/src/services/queues';

const CreateInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  isDefault: z.coerce.boolean().optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  isDefault: z.coerce.boolean().optional(),
});

const DeleteInput = z.object({ id: z.string().uuid() });

export type QueueFormState = { ok: true } | { ok: false; error: string };

export async function createQueueAction(
  _prev: QueueFormState | undefined,
  formData: FormData,
): Promise<QueueFormState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'queues:manage');

  const parsed = CreateInput.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    isDefault: formData.get('isDefault') === 'on',
  });
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos.' };
  }

  try {
    await createQueue(ctx.organizationId, ctx.userId, parsed.data);
    revalidatePath('/settings/queues');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateQueueAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'queues:manage');

  const parsed = UpdateInput.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    isDefault: formData.get('isDefault') === 'on',
  });
  if (!parsed.success) return;

  await updateQueue(ctx.organizationId, ctx.userId, parsed.data.id, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    isDefault: parsed.data.isDefault,
  });
  revalidatePath('/settings/queues');
}

export async function deleteQueueAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'queues:manage');

  const parsed = DeleteInput.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  await deleteQueue(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/settings/queues');
}
