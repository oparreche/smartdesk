import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { getIntegration } from '@/src/services/integrations/crud';
import { IntegrationForm } from '../integration-form';
import { deleteIntegrationAction, manualRunAction } from '../actions';
import { TestPanel } from './test-panel';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Integração ${id.slice(0, 6)} — SmartDesk` };
}

export default async function IntegrationEditPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'integrations:write');
  const { id } = await props.params;

  const integration = await getIntegration(ctx.organizationId, id);
  if (!integration) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/integrations" className="hover:text-foreground hover:underline">Integrações</Link>
            <span>/</span>
            <span className="font-mono">{integration.id.slice(0, 8)}</span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{integration.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Editar configuração e mapeamento.</p>
        </div>
        <Link
          href={`/integrations/${integration.id}/runs`}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
        >
          Ver runs <span aria-hidden className="font-mono text-xs">↗</span>
        </Link>
      </header>

      <TestPanel integrationId={integration.id} />

      <section className="card p-4">
        <h2 className="divider-eyebrow mb-3">Executar manualmente</h2>
        <form action={manualRunAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="integrationId" value={integration.id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">Código do ticket (opcional)</span>
            <input
              name="ticketCode"
              placeholder="HELP-100001"
              className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-sm shadow-xs outline-none focus:border-primary"
            />
          </label>
          <button
            type="submit"
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm hover:bg-muted"
          >
            Enfileirar execução
          </button>
        </form>
      </section>

      <IntegrationForm mode="edit" initial={integration} />

      <section className="rounded-md border border-destructive/30 bg-destructive-soft/30 p-4">
        <form action={deleteIntegrationAction} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">Zona de perigo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Excluir integração (soft-delete, runs antigas preservadas).
            </p>
          </div>
          <input type="hidden" name="id" value={integration.id} />
          <button
            type="submit"
            className="rounded-sm border border-destructive/30 bg-surface-raised px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            Excluir
          </button>
        </form>
      </section>
    </div>
  );
}
