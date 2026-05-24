import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listLayouts } from '@/src/services/layouts';
import { formatRelativeShort } from '@/src/lib/format';

export const metadata = { title: 'Painel Inteligente — SmartDesk' };

export default async function LayoutsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'layouts:read');

  const layouts = await listLayouts(ctx.organizationId);
  const now = new Date();

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Construtor de contexto</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Painel Inteligente
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Configure os blocos que aparecem ao lado da conversa em cada ticket.
          </p>
        </div>
        <Link
          href="/layouts/new"
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
        >
          Novo layout <span aria-hidden className="font-mono text-xs">＋</span>
        </Link>
      </header>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Padrão?</th>
              <th className="px-4 py-3 font-medium">Versão</th>
              <th className="px-4 py-3 font-medium text-right">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {layouts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhum layout ainda. <Link href="/layouts/new" className="text-primary hover:underline">Criar primeiro</Link>.
                </td>
              </tr>
            ) : (
              layouts.map((l) => (
                <tr key={l.id} className="border-t border-border-subtle transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/layouts/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {l.isDefault ? (
                      <span className="pill" style={{ backgroundColor: '#e8eaf2', color: '#1c2541' }}>
                        padrão
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 numeral-serif text-sm text-muted-foreground">v{l.version}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground" title={l.updatedAt.toISOString()}>
                    {formatRelativeShort(l.updatedAt, now)}
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
