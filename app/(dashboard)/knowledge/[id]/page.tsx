import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { getById } from '@/src/services/kb';
import { ArticleEditor } from '../article-editor';
import { deleteArticleAction } from '../actions';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Artigo ${id.slice(0, 6)} — SmartDesk` };
}

export default async function EditArticlePage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');
  const { id } = await props.params;
  const a = await getById(ctx.organizationId, id);
  if (!a) notFound();

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/knowledge" className="text-muted-foreground hover:text-foreground hover:underline">
            Knowledge
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            {a.slug}
          </span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          {a.title}
        </h1>
        {a.status === 'published' ? (
          <p className="text-xs text-muted-foreground">
            Público em{' '}
            <Link
              href={`/help/${ctx.organizationSlug}/${a.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              /help/{ctx.organizationSlug}/{a.slug}
            </Link>
          </p>
        ) : null}
      </header>

      <ArticleEditor
        mode="edit"
        id={a.id}
        initial={{
          title: a.title,
          slug: a.slug,
          excerpt: a.excerpt,
          content: a.content,
          category: a.category,
          tags: a.tags,
          status: a.status,
        }}
      />

      <section className="rounded-md border border-destructive/30 bg-destructive-soft/30 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="divider-eyebrow text-destructive">Zona de perigo</p>
            <h3 className="mt-1 font-display text-base font-medium tracking-tight">
              Excluir artigo
            </h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Soft-delete — artigo some da listagem e busca pública. Histórico fica em auditoria.
            </p>
          </div>
          <form action={deleteArticleAction}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="redirect" value="1" />
            <button
              type="submit"
              className="rounded-sm border border-destructive/30 bg-surface-raised px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive-soft"
            >
              Excluir
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
