import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listRules } from '@/src/services/rules/crud';
import { formatRelativeShort } from '@/src/lib/format';

export const metadata = { title: 'Regras — SmartDesk' };

const TRIGGER_LABELS: Record<string, string> = {
  ticket_created: 'Ticket criado',
  ticket_updated: 'Ticket atualizado',
  ticket_enriched: 'Ticket enriquecido',
  email_received: 'Email recebido',
  form_submitted: 'Formulário enviado',
};

export default async function RulesListPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'rules:read');

  const rules = await listRules(ctx.organizationId);
  const now = new Date();

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Automação</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Regras
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Reaja a eventos do ticket aplicando prioridade, fila, atribuição, tags e mais.
          </p>
        </div>
        <Link
          href="/rules/new"
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
        >
          Nova regra <span aria-hidden className="font-mono text-xs">＋</span>
        </Link>
      </header>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Trigger</th>
              <th className="px-4 py-3 font-medium">Ordem</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Atualizada</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhuma regra ainda. <Link href="/rules/new" className="text-primary hover:underline">Criar primeira</Link>.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/rules/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground-secondary">
                      {TRIGGER_LABELS[r.trigger] ?? r.trigger}
                    </span>
                  </td>
                  <td className="px-4 py-3 numeral-serif text-sm text-muted-foreground">{r.runOrder}</td>
                  <td className="px-4 py-3">
                    {r.enabled ? (
                      <span className="pill" style={{ backgroundColor: '#e3f1ea', color: '#1d6d56' }}>Ativa</span>
                    ) : (
                      <span className="pill" style={{ backgroundColor: '#ebe8df', color: '#4a4c54' }}>Desativada</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatRelativeShort(r.updatedAt, now)}
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
