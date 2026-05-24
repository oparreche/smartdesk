import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listArticles } from '@/src/services/kb';
import { formatDateTime } from '@/src/lib/format';

export const metadata = { title: 'Knowledge Base — SmartDesk' };

export default async function KnowledgePage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:write');

  const sp = await props.searchParams;
  const filter = (sp.status as 'all' | 'draft' | 'published' | 'archived') ?? 'all';
  const articles = await listArticles(ctx.organizationId, { status: filter });

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">SmartDesk</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Knowledge
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
              Base de conhecimento
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Artigos públicos pesquisáveis em <code className="rounded-sm bg-muted px-1 font-mono">/help/{ctx.organizationSlug}</code>.
              Também aparecem como sugestão no momento da abertura de ticket.
            </p>
          </div>
          <Link
            href="/knowledge/new"
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
          >
            ＋ Novo artigo
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
          Filtrar:
        </span>
        {[
          { v: 'all', label: 'Todos' },
          { v: 'published', label: 'Publicados' },
          { v: 'draft', label: 'Rascunhos' },
          { v: 'archived', label: 'Arquivados' },
        ].map((f) => (
          <Link
            key={f.v}
            href={f.v === 'all' ? '/knowledge' : `/knowledge?status=${f.v}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === f.v
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface-raised text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {f.label}
          </Link>
        ))}
        <Link
          href={`/help/${ctx.organizationSlug}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-primary hover:underline"
        >
          ↗ Ver página pública
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted-foreground">
          Nenhum artigo {filter !== 'all' ? `com status ${filter}` : 'ainda'}.{' '}
          <Link href="/knowledge/new" className="text-primary hover:underline">
            Crie o primeiro
          </Link>
          .
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/knowledge/${a.id}`}
                className="card flex items-start justify-between gap-3 p-4 transition-colors hover:border-border-strong"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="font-display text-base font-medium tracking-tight">
                      {a.title}
                    </h3>
                    {a.status === 'published' ? (
                      <span className="pill bg-success-soft text-success">● publicado</span>
                    ) : a.status === 'draft' ? (
                      <span className="pill bg-warning-soft text-warning">○ rascunho</span>
                    ) : (
                      <span className="pill bg-muted text-muted-foreground">arquivado</span>
                    )}
                    {a.category ? (
                      <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                        {a.category}
                      </code>
                    ) : null}
                  </div>
                  {a.excerpt ? (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {a.excerpt}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
                    <span><span className="numeral-serif text-foreground">{a.viewCount}</span> views</span>
                    {a.helpfulYes + a.helpfulNo > 0 ? (
                      <span>
                        👍 {a.helpfulYes} · 👎 {a.helpfulNo}
                      </span>
                    ) : null}
                    <span>atualizado {formatDateTime(a.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
