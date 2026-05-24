'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { createArticle, updateArticle, deleteArticle } from '@/src/services/kb';

const StatusSchema = z.enum(['draft', 'published', 'archived']);

const CreateInput = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(120).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(1).max(80_000),
  category: z.string().max(80).optional(),
  tags: z.string().max(500).optional(),
  status: StatusSchema.default('draft'),
});

const UpdateInput = CreateInput.extend({ id: z.string().uuid() });

export type ArticleState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | undefined;

export async function createArticleAction(
  _prev: ArticleState,
  form: FormData,
): Promise<ArticleState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = CreateInput.safeParse({
    title: form.get('title'),
    slug: form.get('slug') || undefined,
    excerpt: form.get('excerpt') || undefined,
    content: form.get('content'),
    category: form.get('category') || undefined,
    tags: form.get('tags') || undefined,
    status: form.get('status') || 'draft',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Inválido' };

  try {
    const result = await createArticle(ctx.organizationId, ctx.userId, parsed.data);
    revalidatePath('/knowledge');
    return { ok: true, id: result.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateArticleAction(
  _prev: ArticleState,
  form: FormData,
): Promise<ArticleState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const parsed = UpdateInput.safeParse({
    id: form.get('id'),
    title: form.get('title'),
    excerpt: form.get('excerpt') || undefined,
    content: form.get('content'),
    category: form.get('category') || undefined,
    tags: form.get('tags') || undefined,
    status: form.get('status') || 'draft',
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Inválido' };

  try {
    await updateArticle(ctx.organizationId, ctx.userId, parsed.data.id, {
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      category: parsed.data.category,
      tags: parsed.data.tags,
      status: parsed.data.status,
    });
    revalidatePath('/knowledge');
    revalidatePath(`/knowledge/${parsed.data.id}`);
    return { ok: true, id: parsed.data.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteArticleAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');
  const id = String(form.get('id') ?? '');
  if (!id) return;
  try {
    await deleteArticle(ctx.organizationId, ctx.userId, id);
  } catch {
    /* noop */
  }
  revalidatePath('/knowledge');
  if (form.get('redirect') === '1') redirect('/knowledge');
}
