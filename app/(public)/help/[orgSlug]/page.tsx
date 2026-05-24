import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/src/lib/prisma';
import { listArticles, searchPublished } from '@/src/services/kb';

export async function generateMetadata(props: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await props.params;
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, deletedAt: null },
    select: { name: true },
  });
  return { title: org ? `Central de ajuda — ${org.name}` : 'Central de ajuda' };
}

export default async function HelpHome(props: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgSlug } = await props.params;
  const sp = await props.searchParams;
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  if (!org) notFound();

  const q = sp.q?.trim() ?? '';
  const articles = q
    ? await searchPublished(org.id, q, 30)
    : (await listArticles(org.id, { status: 'published' })).slice(0, 30);

  // Agrupa por categoria quando não há busca
  const grouped = q ? null : groupByCategory(articles);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href={`/help/${org.slug}`} className="font-display text-lg font-semibold tracking-tight">
            {org.name}
          </Link>
          <Link
            href={`/portal/${org.slug}`}
            className="rounded-sm border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Portal de chamados →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="mb-8">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            Central de ajuda
          </h1>
          <form method="get" className="mt-5">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar artigos…"
              className="w-full rounded-sm border border-border bg-surface-raised px-4 py-3 text-base shadow-xs outline-none focus:border-primary focus:bg-background"
            />
          </form>
        </section>

        {q ? (
          <section>
            <p className="mb-4 text-xs text-muted-foreground">
              {articles.length} resultado{articles.length === 1 ? '' : 's'} para{' '}
              <strong className="text-foreground">{q}</strong>
            </p>
            {articles.length === 0 ? (
              <p className="card p-8 text-center text-sm text-muted-foreground">
                Nada encontrado. Tente outras palavras-chave.
              </p>
            ) : (
              <ArticleList orgSlug={org.slug} items={articles} />
            )}
          </section>
        ) : grouped && Object.keys(grouped).length > 0 ? (
          <div className="flex flex-col gap-8">
            {Object.entries(grouped).map(([category, items]) => (
              <section key={category}>
                <h2 className="mb-3 font-display text-base font-medium tracking-tight">
                  {category}
                </h2>
                <ArticleList orgSlug={org.slug} items={items} />
              </section>
            ))}
          </div>
        ) : (
          <p className="card p-8 text-center text-sm text-muted-foreground">
            Nenhum artigo publicado ainda.
          </p>
        )}
      </main>
    </div>
  );
}

function ArticleList({
  orgSlug,
  items,
}: {
  orgSlug: string;
  items: Array<{ id: string; slug: string; title: string; excerpt: string | null }>;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-md border border-border bg-surface">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={`/help/${orgSlug}/${a.slug}`}
            className="block px-5 py-4 hover:bg-muted/40"
          >
            <p className="font-medium text-foreground">{a.title}</p>
            {a.excerpt ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {a.excerpt}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function groupByCategory<T extends { category: string | null }>(
  items: T[],
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const a of items) {
    const k = a.category ?? 'Geral';
    (out[k] ??= []).push(a);
  }
  return out;
}
