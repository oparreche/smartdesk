import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { listForms } from '@/src/services/forms';
import { formatRelativeShort } from '@/src/lib/format';

export const metadata = { title: 'Formulários — SmartDesk' };

export default async function FormsPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'forms:read');

  const forms = await listForms(ctx.organizationId);
  const now = new Date();

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Captura</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Formulários</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Páginas públicas que viram tickets automaticamente.
          </p>
        </div>
        <Link
          href="/forms/new"
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
        >
          Novo formulário <span aria-hidden className="font-mono text-xs">＋</span>
        </Link>
      </header>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">URL pública</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Campos</th>
              <th className="px-4 py-3 font-medium">Submissões</th>
              <th className="px-4 py-3 font-medium text-right">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {forms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhum formulário ainda. <Link href="/forms/new" className="text-primary hover:underline">Criar primeiro</Link>.
                </td>
              </tr>
            ) : (
              forms.map((f) => (
                <tr key={f.id} className="border-t border-border-subtle transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/forms/${f.id}`} className="font-medium hover:underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">/f/{f.slug}</td>
                  <td className="px-4 py-3">
                    {f.isPublished ? (
                      <span className="pill" style={{ backgroundColor: '#e3f1ea', color: '#1d6d56' }}>
                        Publicado
                      </span>
                    ) : (
                      <span className="pill" style={{ backgroundColor: '#ebe8df', color: '#4a4c54' }}>
                        Rascunho
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{f._count.fields}</td>
                  <td className="px-4 py-3 tabular-nums">{f._count.submissions}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground" title={f.updatedAt.toISOString()}>
                    {formatRelativeShort(f.updatedAt, now)}
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
