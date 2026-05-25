'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { enqueue } from '@/src/services/jobs/enqueue';
import { putObject, buildKnowledgeKey } from '@/src/lib/s3';

const AddUrlInput = z.object({
  url: z.string().url(),
  name: z.string().max(200).optional(),
});

export type AddUrlState = { ok: true; sourceId: string } | { ok: false; error: string };

export async function addUrlSourceAction(
  _prev: AddUrlState | undefined,
  form: FormData,
): Promise<AddUrlState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');
  const parsed = AddUrlInput.safeParse({
    url: form.get('url'),
    name: (form.get('name') as string | null) || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'URL inválida' };

  const existing = await prisma.knowledgeSource.findFirst({
    where: { organizationId: ctx.organizationId, type: 'url', sourceUrl: parsed.data.url, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    await enqueue({
      type: 'knowledge.index_source',
      payload: { sourceId: existing.id },
      organizationId: ctx.organizationId,
    });
    revalidatePath('/copilot/sources');
    return { ok: true, sourceId: existing.id };
  }

  const src = await prisma.knowledgeSource.create({
    data: {
      organizationId: ctx.organizationId,
      type: 'url',
      name: parsed.data.name ?? parsed.data.url,
      sourceUrl: parsed.data.url,
      status: 'pending',
    },
    select: { id: true },
  });
  await enqueue({
    type: 'knowledge.index_source',
    payload: { sourceId: src.id },
    organizationId: ctx.organizationId,
  });
  revalidatePath('/copilot/sources');
  return { ok: true, sourceId: src.id };
}

const IdInput = z.object({ id: z.string().uuid() });

export async function reindexSourceAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');
  const parsed = IdInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  const src = await prisma.knowledgeSource.findFirst({
    where: { id: parsed.data.id, organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!src) return;
  await prisma.knowledgeSource.update({
    where: { id: src.id },
    data: { contentHash: null, status: 'pending' }, // força re-index
  });
  await enqueue({
    type: 'knowledge.index_source',
    payload: { sourceId: src.id },
    organizationId: ctx.organizationId,
  });
  revalidatePath('/copilot/sources');
}

export async function deleteSourceAction(form: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');
  const parsed = IdInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return;
  await prisma.knowledgeSource.updateMany({
    where: { id: parsed.data.id, organizationId: ctx.organizationId },
    data: { deletedAt: new Date() },
  });
  await prisma.knowledgeChunk.deleteMany({
    where: { sourceId: parsed.data.id, organizationId: ctx.organizationId },
  });
  revalidatePath('/copilot/sources');
}

/** Sincroniza todos os KB articles publicados como sources do tipo kb_article. */
export async function syncKbArticlesAction(): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const articles = await prisma.kbArticle.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, status: 'published' },
    select: { id: true, title: true },
  });

  for (const art of articles) {
    const existing = await prisma.knowledgeSource.findFirst({
      where: {
        organizationId: ctx.organizationId,
        type: 'kb_article',
        refId: art.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    const sourceId = existing
      ? existing.id
      : (
          await prisma.knowledgeSource.create({
            data: {
              organizationId: ctx.organizationId,
              type: 'kb_article',
              name: art.title,
              refId: art.id,
              status: 'pending',
            },
            select: { id: true },
          })
        ).id;
    await enqueue({
      type: 'knowledge.index_source',
      payload: { sourceId },
      organizationId: ctx.organizationId,
    });
  }
  revalidatePath('/copilot/sources');
}

export type UploadState = { ok: true; sourceId: string } | { ok: false; error: string };

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_UPLOAD_EXTS = ['.pdf', '.docx', '.md', '.markdown', '.txt'];

/** Recebe um File da UI, faz upload pro MinIO e cria KnowledgeSource type=upload. */
export async function uploadFileSourceAction(
  _prev: UploadState | undefined,
  form: FormData,
): Promise<UploadState> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Arquivo inválido' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Arquivo passou de 25MB (${Math.round(file.size / 1024 / 1024)}MB)` };
  }
  const lowerName = file.name.toLowerCase();
  const okExt = ALLOWED_UPLOAD_EXTS.some((e) => lowerName.endsWith(e));
  if (!okExt) {
    return { ok: false, error: `Extensão não suportada. Use: ${ALLOWED_UPLOAD_EXTS.join(', ')}` };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const key = buildKnowledgeKey(ctx.organizationId, file.name);
  await putObject({ key, body: buf, contentType: file.type || 'application/octet-stream' });

  const src = await prisma.knowledgeSource.create({
    data: {
      organizationId: ctx.organizationId,
      type: 'upload',
      name: file.name,
      fileKey: key,
      status: 'pending',
    },
    select: { id: true },
  });
  await enqueue({
    type: 'knowledge.index_source',
    payload: { sourceId: src.id },
    organizationId: ctx.organizationId,
  });
  revalidatePath('/copilot/sources');
  return { ok: true, sourceId: src.id };
}

/** Indexa todos os tickets fechados/resolvidos como sources do tipo ticket. */
export async function syncTicketsAction(): Promise<void> {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      status: { in: ['resolved', 'closed'] },
    },
    select: { id: true, code: true, subject: true },
    take: 500,
  });

  for (const t of tickets) {
    const existing = await prisma.knowledgeSource.findFirst({
      where: {
        organizationId: ctx.organizationId,
        type: 'ticket',
        refId: t.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    const sourceId = existing
      ? existing.id
      : (
          await prisma.knowledgeSource.create({
            data: {
              organizationId: ctx.organizationId,
              type: 'ticket',
              name: `${t.code} — ${t.subject}`,
              refId: t.id,
              status: 'pending',
            },
            select: { id: true },
          })
        ).id;
    await enqueue({
      type: 'knowledge.index_source',
      payload: { sourceId },
      organizationId: ctx.organizationId,
    });
  }
  revalidatePath('/copilot/sources');
}
