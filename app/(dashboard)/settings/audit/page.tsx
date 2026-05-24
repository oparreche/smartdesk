import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listAudit, listDistinctActions } from '@/src/services/audit/list';
import { formatDateTime } from '@/src/lib/format';

export const metadata = { title: 'Auditoria — SmartDesk' };

type SearchParams = Record<string, string | string[] | undefined>;

const RESOURCE_TYPES = ['ticket', 'integration', 'layout', 'rule', 'form', 'queue', 'tag', 'gmail_connection'];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AuditPage(props: { searchParams: Promise<SearchParams> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'audit:read');

  const sp = await props.searchParams;
  const filters = {
    action: one(sp.action),
    resourceType: one(sp.resourceType),
    actorUserId: one(sp.actor),
    since: one(sp.since) ? new Date(one(sp.since)!) : undefined,
  };
  const page = Number(one(sp.page) ?? 1);

  const [result, actions] = await Promise.all([
    listAudit(ctx.organizationId, filters, { page, pageSize: 50 }),
    listDistinctActions(ctx.organizationId),
  ]);

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <p className="divider-eyebrow text-muted-foreground">Configurações · forense</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Auditoria</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Histórico completo de mutações sensíveis. Apenas leitura.
        </p>
      </header>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <FilterField label="Ação">
          <select
            name="action"
            defaultValue={filters.action ?? ''}
            className="w-48 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterField>
        <FilterField label="Recurso">
          <select
            name="resourceType"
            defaultValue={filters.resourceType ?? ''}
            className="w-36 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {RESOURCE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </FilterField>
        <FilterField label="Desde">
          <input
            type="date"
            name="since"
            defaultValue={filters.since ? filters.since.toISOString().slice(0, 10) : ''}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          />
        </FilterField>
        <button
          type="submit"
          className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
        >
          Filtrar
        </button>
        <Link href="/settings/audit" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          limpar
        </Link>
      </form>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Quando</th>
              <th className="px-4 py-3 font-medium">Ator</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Recurso</th>
              <th className="px-4 py-3 font-medium">Diff</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  Nenhuma entrada de auditoria com os filtros atuais.
                </td>
              </tr>
            ) : (
              result.rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-xs text-muted-foreground" title={r.createdAt.toISOString()}>
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.actor ? (
                      <>
                        <div>{r.actor.name}</div>
                        <div className="text-muted-foreground">{r.actor.email}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">sistema</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.resourceType ? (
                      <span>
                        {r.resourceType}
                        {r.resourceId ? (
                          <span className="ml-1 font-mono text-muted-foreground">
                            {r.resourceId.slice(0, 8)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-md">
                    {r.diff ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          ver diff
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted/30 p-2 text-xs">
                          {JSON.stringify(r.diff, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <footer className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {result.total} entrada{result.total === 1 ? '' : 's'} · página {result.page} de {result.totalPages}
        </span>
        <Pagination current={result.page} total={result.totalPages} searchParams={sp} />
      </footer>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Pagination({
  current,
  total,
  searchParams,
}: {
  current: number;
  total: number;
  searchParams: SearchParams;
}) {
  function withPage(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page') continue;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (v) params.set(k, v);
    }
    params.set('page', String(p));
    return `/settings/audit?${params.toString()}`;
  }
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <a
        href={withPage(Math.max(1, current - 1))}
        className={`rounded-md border border-border px-2 py-1 text-xs ${current === 1 ? 'pointer-events-none opacity-50' : 'hover:bg-muted'}`}
      >
        ←
      </a>
      <a
        href={withPage(Math.min(total, current + 1))}
        className={`rounded-md border border-border px-2 py-1 text-xs ${current === total ? 'pointer-events-none opacity-50' : 'hover:bg-muted'}`}
      >
        →
      </a>
    </div>
  );
}
