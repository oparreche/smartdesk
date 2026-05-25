'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createTag, deleteTag, updateTagCategorization } from '@/src/services/tags';
import { upsertCategorizationConfig } from '@/src/services/categorization/config';
import { parseKeywords } from '@/src/services/categorization/keywords';

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

const TagCategorizationInput = z.object({
  id: z.string().uuid(),
  description: z.string().max(2000).optional(),
  keywords: z.string().max(4000).optional(),
  minKeywordMatches: z.coerce.number().int().min(1).max(10).default(2),
  autoCategorize: z.union([z.literal('on'), z.literal('true'), z.literal('')]).optional(),
});

export async function updateTagCategorizationAction(
  _prev: TagFormState | undefined,
  formData: FormData,
): Promise<TagFormState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tags:manage');

  const parsed = TagCategorizationInput.safeParse({
    id: formData.get('id'),
    description: formData.get('description') ?? undefined,
    keywords: formData.get('keywords') ?? undefined,
    minKeywordMatches: formData.get('minKeywordMatches') ?? 2,
    autoCategorize: formData.get('autoCategorize') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  try {
    await updateTagCategorization(ctx.organizationId, ctx.userId, parsed.data.id, {
      description: parsed.data.description?.trim() || null,
      keywords: parseKeywords(parsed.data.keywords ?? ''),
      minKeywordMatches: parsed.data.minKeywordMatches,
      autoCategorize: parsed.data.autoCategorize === 'on' || parsed.data.autoCategorize === 'true',
    });
    revalidatePath('/settings/tags');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const CategorizationConfigInput = z.object({
  enabled: z.union([z.literal('on'), z.literal('true'), z.literal('')]).optional(),
  mode: z.enum(['auto', 'keywords', 'ai']),
  geminiApiKey: z.string().max(200).optional(),
});

export async function saveCategorizationConfigAction(
  _prev: TagFormState | undefined,
  formData: FormData,
): Promise<TagFormState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tags:manage');

  const parsed = CategorizationConfigInput.safeParse({
    enabled: formData.get('enabled') ?? undefined,
    mode: formData.get('mode'),
    geminiApiKey: formData.get('geminiApiKey') ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Dados inválidos.' };

  // Só atualiza a chave se o campo veio preenchido (placeholder mascarado fica vazio).
  const keyRaw = parsed.data.geminiApiKey?.trim();
  const geminiApiKey = keyRaw ? keyRaw : undefined;

  try {
    await upsertCategorizationConfig(ctx.organizationId, ctx.userId, {
      enabled: parsed.data.enabled === 'on' || parsed.data.enabled === 'true',
      mode: parsed.data.mode,
      geminiApiKey,
    });
    revalidatePath('/settings/tags');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
