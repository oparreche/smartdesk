import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { formatDateTime } from '@/src/lib/format';
import { AddUrlForm } from './add-url-form';
import {
  reindexSourceAction,
  deleteSourceAction,
  syncKbArticlesAction,
  syncTicketsAction,
} from './actions';

export const metadata = { title: 'Fontes do Copilot — SmartDesk' };

export default async function CopilotSourcesPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const sources = await prisma.knowledgeSource.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      type: true,
      name: true,
      sourceUrl: true,
      status: true,
      error: true,
      chunkCount: true,
      lastIndexedAt: true,
      createdAt: true,
    },
  });

  const counts = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/copilot" className="text-muted-foreground hover:text-foreground hover:underline">
            Copilot
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">Fontes</span>
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Fontes de conhecimento
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          O que o Copilot consegue responder depende do que você indexa aqui. URLs públicas,
          artigos do KB interno e (opcional) tickets resolvidos.
        </p>
      </header>

      <section className="card flex flex-col gap-4 p-5">
        <header>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">01</span>
            <span className="mx-1.5 opacity-40">·</span>
            URL
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cole uma URL pública (ex.: doc do produto, FAQ, blog). Sistema baixa, extrai texto,
            chunka e indexa em background. Re-index manual no botão Sync.
          </p>
        </header>
        <AddUrlForm />
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <header>
          <p className="divider-eyebrow text-muted-foreground">
            <span className="numeral-serif text-[0.6875rem] text-primary">02</span>
            <span className="mx-1.5 opacity-40">·</span>
            Sincronizar internas
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Indexa todos os artigos publicados do{' '}
            <Link href="/knowledge" className="text-primary hover:underline">KB interno</Link>{' '}
            e todos os tickets resolvidos/fechados como fontes individuais.
          </p>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <form action={syncKbArticlesAction}>
            <button
              type="submit"
              className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
            >
              ↻ Sync KB articles
            </button>
          </form>
          <form action={syncTicketsAction}>
            <button
              type="submit"
              className="rounded-sm border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
            >
              ↻ Sync tickets resolvidos
            </button>
          </form>
          <span className="text-[0.6875rem] text-muted-foreground">
            (re-indexa só os que mudaram desde a última vez)
          </span>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <p className="divider-eyebrow text-muted-foreground">
              <span className="numeral-serif text-[0.6875rem] text-primary">03</span>
              <span className="mx-1.5 opacity-40">·</span>
              Fontes indexadas ({sources.length})
            </p>
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              URL {counts.url ?? 0} · KB {counts.kb_article ?? 0} · Ticket {counts.ticket ?? 0}
            </p>
          </div>
        </header>

        {sources.length === 0 ? (
          <p className="rounded-sm border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Nenhuma fonte ainda. Comece adicionando uma URL ou sincronizando KB.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="rounded-sm border border-border bg-surface-raised p-3 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                      <span className="text-[0.6875rem] text-muted-foreground">· {s.type}</span>
                    </div>
                    {s.sourceUrl ? (
                      <a
                        href={s.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[0.6875rem] text-primary hover:underline"
                      >
                        {s.sourceUrl}
                      </a>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.6875rem]">
                      <StatusBadge status={s.status} />
                      <span className="text-muted-foreground">{s.chunkCount} chunks</span>
                      {s.lastIndexedAt ? (
                        <span className="text-muted-foreground">
                          · indexado {formatDateTime(s.lastIndexedAt)}
                        </span>
                      ) : null}
                    </div>
                    {s.error ? (
                      <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive-soft px-2 py-1 text-[0.6875rem] text-destructive">
                        ⚠ {s.error.slice(0, 200)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <form action={reindexSourceAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                      >
                        ↻ Reindexar
                      </button>
                    </form>
                    <form action={deleteSourceAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:border-destructive/40 hover:bg-destructive-soft hover:text-destructive"
                      >
                        Excluir
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: 'bg-muted',            text: 'text-muted-foreground', label: 'aguardando' },
    indexing: { bg: 'bg-info-soft',        text: 'text-info',             label: 'indexando' },
    indexed:  { bg: 'bg-success-soft',     text: 'text-success',          label: 'indexado' },
    failed:   { bg: 'bg-destructive-soft', text: 'text-destructive',      label: 'falhou' },
    stale:    { bg: 'bg-warning-soft',     text: 'text-warning',          label: 'desatualizado' },
  };
  const s = map[status] ?? map.pending!;
  return <span className={`pill ${s.bg} ${s.text}`}>{s.label}</span>;
}
