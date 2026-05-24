'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import {
  createForm,
  updateForm,
  deleteForm,
  addFormField,
  deleteFormField,
  moveFormField,
} from '@/src/services/forms';

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export type CreateFormState = { ok: true; id: string } | { ok: false; error: string };

export async function createFormAction(
  _prev: CreateFormState | undefined,
  formData: FormData,
): Promise<CreateFormState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  const parsed = CreateInput.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  try {
    const created = await createForm(ctx.organizationId, ctx.userId, parsed.data);
    revalidatePath('/forms');
    redirect(`/forms/${created.id}`);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  successMessage: z.string().max(500).optional(),
  defaultQueueId: z.string().uuid().optional().or(z.literal('')),
  defaultPriority: z.enum(['low', 'normal', 'high', 'urgent', 'critical']),
  isPublished: z.coerce.boolean(),
});

export async function updateFormAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  const parsed = UpdateInput.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    successMessage: formData.get('successMessage') || undefined,
    defaultQueueId: formData.get('defaultQueueId') || '',
    defaultPriority: formData.get('defaultPriority'),
    isPublished: formData.get('isPublished') === 'on',
  });
  if (!parsed.success) return;

  await updateForm(ctx.organizationId, ctx.userId, parsed.data.id, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    successMessage: parsed.data.successMessage ?? null,
    defaultQueueId: parsed.data.defaultQueueId || null,
    defaultPriority: parsed.data.defaultPriority,
    isPublished: parsed.data.isPublished,
  });
  revalidatePath(`/forms/${parsed.data.id}`);
  revalidatePath('/forms');
}

const DeleteInput = z.object({ id: z.string().uuid() });

export async function deleteFormAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  const parsed = DeleteInput.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  await deleteForm(ctx.organizationId, ctx.userId, parsed.data.id);
  revalidatePath('/forms');
  redirect('/forms');
}

const AddFieldInput = z.object({
  formId: z.string().uuid(),
  label: z.string().min(1).max(120),
  type: z.enum([
    'text', 'textarea', 'email', 'phone', 'document', 'number',
    'currency', 'date', 'select', 'multiselect', 'checkbox', 'url', 'hidden',
  ]),
  required: z.coerce.boolean().optional(),
  mapsTo: z.string().optional(),
  options: z.string().optional(),
});

export async function addFieldAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  const parsed = AddFieldInput.safeParse({
    formId: formData.get('formId'),
    label: formData.get('label'),
    type: formData.get('type'),
    required: formData.get('required') === 'on',
    mapsTo: formData.get('mapsTo') || undefined,
    options: formData.get('options') || undefined,
  });
  if (!parsed.success) return;

  await addFormField(ctx.organizationId, ctx.userId, parsed.data.formId, {
    label: parsed.data.label,
    type: parsed.data.type,
    required: parsed.data.required,
    mapsTo: parsed.data.mapsTo || null,
    options: parsed.data.options
      ? parsed.data.options.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
  });

  revalidatePath(`/forms/${parsed.data.formId}`);
}

const FieldOpInput = z.object({
  formId: z.string().uuid(),
  fieldId: z.string().uuid(),
});

export async function deleteFieldAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  const parsed = FieldOpInput.safeParse({
    formId: formData.get('formId'),
    fieldId: formData.get('fieldId'),
  });
  if (!parsed.success) return;

  await deleteFormField(ctx.organizationId, ctx.userId, parsed.data.formId, parsed.data.fieldId);
  revalidatePath(`/forms/${parsed.data.formId}`);
}

const MoveInput = FieldOpInput.extend({
  direction: z.enum(['up', 'down']),
});

export async function moveFieldAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:write');

  const parsed = MoveInput.safeParse({
    formId: formData.get('formId'),
    fieldId: formData.get('fieldId'),
    direction: formData.get('direction'),
  });
  if (!parsed.success) return;

  await moveFormField(
    ctx.organizationId,
    ctx.userId,
    parsed.data.formId,
    parsed.data.fieldId,
    parsed.data.direction,
  );
  revalidatePath(`/forms/${parsed.data.formId}`);
}
