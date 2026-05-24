import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listQueues } from '@/src/services/queues';
import { NewQueueForm } from './new-queue-form';
import { deleteQueueAction, updateQueueAction } from './actions';

export const metadata = { title: 'Filas — SmartDesk' };

export default async function QueuesPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'queues:manage');

  const queues = await listQueues(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <p className="divider-eyebrow text-muted-foreground">Configurações</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Filas</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Organize seus tickets em filas. Uma fila pode ser a padrão para novos chamados.
        </p>
      </header>

      <NewQueueForm />

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Padrão?</th>
              <th className="px-4 py-3 font-medium">Tickets</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {queues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nenhuma fila ainda.
                </td>
              </tr>
            ) : (
              queues.map((q) => (
                <tr key={q.id} className="border-t border-border-subtle align-middle hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <form action={updateQueueAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={q.id} />
                      <input
                        name="name"
                        defaultValue={q.name}
                        className="rounded-sm border border-border bg-surface-raised px-2 py-1 text-sm shadow-xs focus:border-primary focus:outline-none"
                      />
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          name="isDefault"
                          defaultChecked={q.isDefault}
                          className="h-3.5 w-3.5"
                        />
                        padrão
                      </label>
                      <button
                        type="submit"
                        className="rounded-sm border border-border px-2.5 py-1 text-xs hover:bg-muted"
                      >
                        Salvar
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{q.slug}</td>
                  <td className="px-4 py-3">
                    {q.isDefault ? (
                      <span className="pill" style={{ backgroundColor: '#e8eaf2', color: '#1c2541' }}>padrão</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 numeral-serif text-sm">{q._count.tickets}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteQueueAction}>
                      <input type="hidden" name="id" value={q.id} />
                      <button
                        type="submit"
                        disabled={q.isDefault}
                        className="rounded-sm border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
                        title={q.isDefault ? 'Não é possível excluir a fila padrão' : 'Excluir'}
                      >
                        Excluir
                      </button>
                    </form>
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
