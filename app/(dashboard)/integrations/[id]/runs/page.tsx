import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { getIntegration, listRuns } from '@/src/services/integrations/crud';
import { formatDateTime, formatRelativeShort } from '@/src/lib/format';

export const metadata = { title: 'Runs — SmartDesk' };

export default async function RunsPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:read');
  const { id } = await props.params;

  const integration = await getIntegration(ctx.organizationId, id);
  if (!integration) notFound();

  const runs = await listRuns(ctx.organizationId, id, 100);
  const now = new Date();

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/integrations" className="hover:text-foreground hover:underline">Integrações</Link>
            <span>/</span>
            <Link href={`/integrations/${id}`} className="hover:text-foreground hover:underline">{integration.name}</Link>
            <span>/</span>
            <span>Runs</span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Histórico de execuções
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Últimas {runs.length} execuções.</p>
        </div>
        <Link
          href={`/integrations/${id}`}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Voltar
        </Link>
      </header>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Trigger</th>
              <th className="px-4 py-3 font-medium">HTTP</th>
              <th className="px-4 py-3 font-medium">Duração</th>
              <th className="px-4 py-3 font-medium">Ticket</th>
              <th className="px-4 py-3 font-medium">Erro</th>
              <th className="px-4 py-3 font-medium text-right">Quando</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhuma execução ainda.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.triggeredBy}</td>
                  <td className="px-4 py-3 tabular-nums font-mono text-xs">{r.responseStatus ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-xs text-muted-foreground">{r.durationMs ?? '—'}ms</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.ticket?.code ? (
                      <Link href={`/tickets/${r.ticket.code}`} className="text-primary hover:underline">
                        {r.ticket.code}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="max-w-md truncate px-4 py-3 text-xs text-destructive" title={r.errorMessage ?? ''}>
                    {r.errorMessage ?? ''}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground" title={formatDateTime(r.startedAt)}>
                    {formatRelativeShort(r.startedAt, now)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    succeeded: { bg: '#e3f1ea', fg: '#1d6d56' },
    failed: { bg: '#fbe0e1', fg: '#9c1f24' },
    running: { bg: '#e3ecf5', fg: '#1e3a5f' },
    pending: { bg: '#faf0d8', fg: '#83580f' },
  };
  const c = map[status] ?? { bg: '#ebe8df', fg: '#4a4c54' };
  return (
    <span className="pill" style={{ backgroundColor: c.bg, color: c.fg }}>
      {status}
    </span>
  );
}
