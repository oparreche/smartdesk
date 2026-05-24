'use server';

import { z } from 'zod';
import { prisma } from '@/src/lib/prisma';
import { searchPublished } from '@/src/services/kb';

const Input = z.object({
  orgSlug: z.string().min(1).max(60),
  query: z.string().min(2).max(200),
});

export async function suggestArticlesAction(
  input: z.infer<typeof Input>,
): Promise<Array<{ slug: string; title: string; excerpt: string | null }>> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return [];

  const org = await prisma.organization.findFirst({
    where: { slug: parsed.data.orgSlug, deletedAt: null },
    select: { id: true },
  });
  if (!org) return [];

  const articles = await searchPublished(org.id, parsed.data.query, 3);
  return articles.map((a) => ({
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
  }));
}
