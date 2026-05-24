import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { getLayout } from '@/src/services/layouts';
import { LayoutConfigSchema } from '@/src/services/layouts/schema';
import { LayoutEditor } from './layout-editor';
import { deleteLayoutAction } from '../actions';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Layout ${id.slice(0, 6)} — SmartDesk` };
}

export default async function LayoutEditPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:write');
  const { id } = await props.params;

  const layout = await getLayout(ctx.organizationId, id);
  if (!layout) notFound();

  let config: { blocks: [] } | ReturnType<typeof LayoutConfigSchema.parse>;
  try {
    config = LayoutConfigSchema.parse(layout.config);
  } catch {
    config = { blocks: [] };
  }

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/layouts" className="hover:text-foreground hover:underline">Painel Inteligente</Link>
          <span>/</span>
          <span className="font-mono">{layout.id.slice(0, 8)}</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{layout.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Variáveis suportadas: <code className="font-mono text-foreground">{'{{ticket.requester.email}}'}</code>,{' '}
          <code className="font-mono text-foreground">{'{{partner.id}}'}</code> e o que vier dos enrichments.
        </p>
      </header>

      <LayoutEditor
        id={layout.id}
        initialName={layout.name}
        initialIsDefault={layout.isDefault}
        initialConfig={config}
      />

      <section className="rounded-md border border-destructive/30 bg-destructive-soft/30 p-4">
        <form action={deleteLayoutAction} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">Zona de perigo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Excluir layout (soft-delete). Não permitido se for o padrão.
            </p>
          </div>
          <input type="hidden" name="id" value={layout.id} />
          <button
            type="submit"
            disabled={layout.isDefault}
            className="rounded-sm border border-destructive/30 bg-surface-raised px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
          >
            Excluir
          </button>
        </form>
      </section>
    </div>
  );
}
