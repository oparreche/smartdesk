import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listIntegrations } from '@/src/services/integrations/crud';
import { formatRelativeShort } from '@/src/lib/format';

export const metadata = { title: 'Integrações — SmartDesk' };

export default async function IntegrationsListPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:read');

  const items = await listIntegrations(ctx.organizationId);
  const now = new Date();

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Diferencial</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Integrações</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Configure chamadas HTTP que enriquecem tickets com dados externos das suas APIs.
          </p>
        </div>
        <Link
          href="/integrations/new"
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
        >
          Nova integração <span aria-hidden className="font-mono text-xs">＋</span>
        </Link>
      </header>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Auth</th>
              <th className="px-4 py-3 font-medium">Triggers</th>
              <th className="px-4 py-3 font-medium">Runs</th>
              <th className="px-4 py-3 font-medium text-right">Atualizada</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhuma integração ainda. <Link href="/integrations/new" className="text-primary hover:underline">Criar primeira</Link>.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const triggers = (it.triggerEvents as unknown as string[]) ?? [];
                return (
                  <tr key={it.id} className="border-t border-border-subtle transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/integrations/${it.id}`} className="font-medium hover:underline">
                        {it.name}
                      </Link>
                      {!it.enabled ? (
                        <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                          off
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-primary">
                        {it.method}
                      </span>
                    </td>
                    <td className="max-w-md truncate px-4 py-3 font-mono text-xs text-muted-foreground" title={it.url}>{it.url}</td>
                    <td className="px-4 py-3 text-xs">
                      {it.authType === 'none' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="font-mono">{it.authType}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {triggers.length ? triggers.map((t) => (
                        <span key={t} className="mr-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.625rem]">{t}</span>
                      )) : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{it._count.runs}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatRelativeShort(it.updatedAt, now)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
