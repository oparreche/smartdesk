import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listTags } from '@/src/services/tags';
import { NewTagForm } from './new-tag-form';
import { deleteTagAction } from './actions';

export const metadata = { title: 'Tags — SmartDesk' };

export default async function TagsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tags:manage');

  const tags = await listTags(ctx.organizationId);

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <p className="divider-eyebrow text-muted-foreground">Configurações</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Tags</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Categorize tickets para facilitar busca, automações e relatórios.
        </p>
      </header>

      <NewTagForm />

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Tag</th>
              <th className="px-4 py-3 font-medium">Cor</th>
              <th className="px-4 py-3 font-medium">Tickets</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nenhuma tag ainda.
                </td>
              </tr>
            ) : (
              tags.map((t) => (
                <tr key={t.id} className="border-t border-border-subtle hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={t.color ? { backgroundColor: `${t.color}22`, color: t.color } : { backgroundColor: 'var(--muted)', color: 'var(--foreground)' }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: t.color ?? 'var(--muted-foreground)' }}
                      />
                      {t.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.color ?? '—'}</td>
                  <td className="px-4 py-3 numeral-serif text-sm">{t._count.tickets}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteTagAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="rounded-sm border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
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
