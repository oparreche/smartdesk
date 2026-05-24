import 'server-only';
import { prisma } from '@/src/lib/prisma';
import { audit } from '@/src/services/audit/log';

const SLUG_MAX = 120;
const TITLE_MAX = 200;
const EXCERPT_MAX = 500;
const CONTENT_MAX = 80_000;
const CATEGORY_MAX = 80;
const TAGS_MAX = 500;

export type KbArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  tags: string | null;
  status: 'draft' | 'published' | 'archived';
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  publishedAt: Date | null;
  updatedAt: Date;
};

export type KbArticleFull = KbArticleSummary & {
  content: string;
  locale: string;
};

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

export async function listArticles(
  organizationId: string,
  filter?: { status?: 'draft' | 'published' | 'archived' | 'all'; q?: string },
): Promise<KbArticleSummary[]> {
  const where: {
    organizationId: string;
    deletedAt: null;
    status?: 'draft' | 'published' | 'archived';
  } = {
    organizationId,
    deletedAt: null,
  };
  if (filter?.status && filter.status !== 'all') where.status = filter.status;

  return prisma.kbArticle.findMany({
    where,
    orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      category: true,
      tags: true,
      status: true,
      viewCount: true,
      helpfulYes: true,
      helpfulNo: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}

export async function getBySlug(
  organizationId: string,
  slug: string,
  includeUnpublished = false,
): Promise<KbArticleFull | null> {
  const a = await prisma.kbArticle.findFirst({
    where: {
      organizationId,
      slug,
      deletedAt: null,
      ...(includeUnpublished ? {} : { status: 'published' }),
    },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      category: true,
      tags: true,
      status: true,
      locale: true,
      viewCount: true,
      helpfulYes: true,
      helpfulNo: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
  return a as KbArticleFull | null;
}

export async function getById(
  organizationId: string,
  id: string,
): Promise<KbArticleFull | null> {
  const a = await prisma.kbArticle.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      category: true,
      tags: true,
      status: true,
      locale: true,
      viewCount: true,
      helpfulYes: true,
      helpfulNo: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
  return a as KbArticleFull | null;
}

export type UpsertInput = {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  category?: string;
  tags?: string;
  status?: 'draft' | 'published' | 'archived';
};

export async function createArticle(
  organizationId: string,
  actorUserId: string,
  input: UpsertInput,
): Promise<{ id: string; slug: string }> {
  const title = input.title.trim().slice(0, TITLE_MAX);
  if (!title) throw new Error('Título obrigatório');
  let slug = (input.slug?.trim() || slugify(title)).slice(0, SLUG_MAX);
  if (!slug) throw new Error('Slug inválido');

  // Garante slug único
  let suffix = 0;
  while (
    await prisma.kbArticle.findFirst({
      where: { organizationId, slug: suffix ? `${slug}-${suffix}` : slug },
      select: { id: true },
    })
  ) {
    suffix++;
  }
  if (suffix > 0) slug = `${slug}-${suffix}`;

  const status = input.status ?? 'draft';

  const created = await prisma.kbArticle.create({
    data: {
      organizationId,
      title,
      slug,
      excerpt: input.excerpt?.trim().slice(0, EXCERPT_MAX) || null,
      content: input.content.slice(0, CONTENT_MAX),
      category: input.category?.trim().slice(0, CATEGORY_MAX) || null,
      tags: input.tags?.trim().slice(0, TAGS_MAX) || null,
      status,
      publishedAt: status === 'published' ? new Date() : null,
      createdById: actorUserId,
    },
    select: { id: true, slug: true },
  });

  await audit({
    organizationId,
    actorUserId,
    action: 'kb.article.create',
    resourceType: 'kb_article',
    resourceId: created.id,
    diff: { after: { title, slug, status } },
  });

  return created;
}

export async function updateArticle(
  organizationId: string,
  actorUserId: string,
  id: string,
  input: Partial<UpsertInput>,
): Promise<void> {
  const existing = await prisma.kbArticle.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!existing) return;

  const data: {
    title?: string;
    excerpt?: string | null;
    content?: string;
    category?: string | null;
    tags?: string | null;
    status?: 'draft' | 'published' | 'archived';
    publishedAt?: Date | null;
  } = {};
  if (input.title !== undefined) data.title = input.title.trim().slice(0, TITLE_MAX);
  if (input.excerpt !== undefined) data.excerpt = input.excerpt?.trim().slice(0, EXCERPT_MAX) || null;
  if (input.content !== undefined) data.content = input.content.slice(0, CONTENT_MAX);
  if (input.category !== undefined) data.category = input.category?.trim().slice(0, CATEGORY_MAX) || null;
  if (input.tags !== undefined) data.tags = input.tags?.trim().slice(0, TAGS_MAX) || null;
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === 'published' && !existing.publishedAt) {
      data.publishedAt = new Date();
    }
  }

  await prisma.kbArticle.update({ where: { id }, data });
  await audit({
    organizationId,
    actorUserId,
    action: 'kb.article.update',
    resourceType: 'kb_article',
    resourceId: id,
    diff: { after: { fields: Object.keys(data) } },
  });
}

export async function deleteArticle(
  organizationId: string,
  actorUserId: string,
  id: string,
): Promise<void> {
  const a = await prisma.kbArticle.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!a) return;
  await prisma.kbArticle.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await audit({
    organizationId,
    actorUserId,
    action: 'kb.article.delete',
    resourceType: 'kb_article',
    resourceId: id,
    diff: { before: { title: a.title } },
  });
}

export async function bumpView(id: string): Promise<void> {
  await prisma.kbArticle
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});
}

export async function voteHelpful(
  id: string,
  helpful: boolean,
): Promise<void> {
  await prisma.kbArticle
    .update({
      where: { id },
      data: helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } },
    })
    .catch(() => {});
}

/**
 * Busca por query — usa MySQL FULLTEXT.
 */
export async function searchPublished(
  organizationId: string,
  q: string,
  limit = 10,
): Promise<KbArticleSummary[]> {
  const term = q.trim();
  if (!term) return [];

  // BOOLEAN MODE pra suportar termos parciais com `*` no fim
  const sanitized = term
    .replace(/[+\-><()~*"@]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => `${w}*`)
    .join(' ');
  if (!sanitized) return [];

  // raw query pra usar MATCH ... AGAINST
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT id, slug, title, excerpt, category, tags, status, view_count as viewCount,
           helpful_yes as helpfulYes, helpful_no as helpfulNo, published_at as publishedAt, updated_at as updatedAt
    FROM kb_articles
    WHERE organization_id = ?
      AND deleted_at IS NULL
      AND status = 'published'
      AND MATCH(title, excerpt, content, tags) AGAINST(? IN BOOLEAN MODE)
    ORDER BY MATCH(title, excerpt, content, tags) AGAINST(? IN BOOLEAN MODE) DESC
    LIMIT ?
  `,
    organizationId,
    sanitized,
    sanitized,
    limit,
  )) as Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    category: string | null;
    tags: string | null;
    status: 'draft' | 'published' | 'archived';
    viewCount: number;
    helpfulYes: number;
    helpfulNo: number;
    publishedAt: Date | null;
    updatedAt: Date;
  }>;

  return rows;
}
