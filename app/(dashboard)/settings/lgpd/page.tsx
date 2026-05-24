import { getOrgContext } from '@/src/lib/tenant';
import { requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { AnonymizeForm } from './lgpd-form';

export const metadata = { title: 'LGPD — SmartDesk' };

export default async function LgpdPage() {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'organization:manage');

  const recent = await prisma.requester.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, name: true, email: true, document: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
      <header className="border-b border-border pb-6">
        <p className="divider-eyebrow text-muted-foreground">Configurações · privacidade</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">LGPD</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Cumprimento de pedidos de remoção de dados pessoais.
        </p>
      </header>

      <AnonymizeForm />

      <section className="card p-5">
        <h2 className="divider-eyebrow mb-3">
          Solicitantes recentes (para copiar ID)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-border-subtle">
              <th className="py-2 font-medium">ID</th>
              <th className="py-2 font-medium">Nome</th>
              <th className="py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum.</td>
              </tr>
            ) : (
              recent.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle">
                  <td className="py-1.5 font-mono text-xs">{r.id}</td>
                  <td className="py-1.5 text-xs">{r.name ?? '—'}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{r.email ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
