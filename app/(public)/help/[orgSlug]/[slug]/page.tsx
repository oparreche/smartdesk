import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/src/lib/prisma';
import { getBySlug, bumpView } from '@/src/services/kb';
import { renderMarkdown } from '@/src/lib/markdown';
import { HelpfulVote } from './helpful-vote';

export async function generateMetadata(props: {
  params: Promise<{ orgSlug: string; slug: string }>;
}) {
  const { orgSlug, slug } = await props.params;
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!org) return { title: 'Artigo' };
  const article = await getBySlug(org.id, slug);
  if (!article) return { title: 'Artigo' };
  return { title: `${article.title} — ${org.name}` };
}

export default async function HelpArticlePage(props: {
  params: Promise<{ orgSlug: string; slug: string }>;
}) {
  const { orgSlug, slug } = await props.params;
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  if (!org) notFound();
  const article = await getBySlug(org.id, slug);
  if (!article) notFound();

  // Bump view in background
  void bumpView(article.id);

  const html = renderMarkdown(article.content);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link
            href={`/help/${org.slug}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            ← {org.name}
          </Link>
          <Link
            href={`/portal/${org.slug}`}
            className="rounded-sm border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Abrir chamado →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <article>
          {article.category ? (
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              {article.category}
            </p>
          ) : null}
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="mt-2 text-base text-muted-foreground">
              {article.excerpt}
            </p>
          ) : null}

          <div
            className="prose-kb mt-8"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>

        <footer className="mt-10 flex flex-col items-center gap-3 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <HelpfulVote articleId={article.id} initialYes={article.helpfulYes} initialNo={article.helpfulNo} />
          <p>
            Não resolveu?{' '}
            <Link href={`/portal/${org.slug}`} className="text-primary hover:underline">
              Abra um chamado
            </Link>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
