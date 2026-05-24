import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { prisma } from '@/src/lib/prisma';
import { can } from '@/src/lib/permissions';
import { OrgNameForm } from './org-form';

export const metadata = { title: 'Organização — SmartDesk' };

export default async function OrganizationPage() {
  const ctx = await getOrgContext();
  const canManage = can(ctx.role, 'organization:manage');

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      plan: true,
      ticketSeq: true,
      createdAt: true,
      _count: { select: { members: true, tickets: true } },
    },
  });
  // Sessão órfã (orgId aponta pra org deletada/inacessível) — desloga e manda pro login.
  if (!org) redirect('/api/auth/signout?callbackUrl=/login');

  const initials = org.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            SmartDesk
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Organização
          </span>
        </div>
        <div className="flex items-center gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border-strong bg-primary text-xl font-medium text-primary-foreground">
            {initials || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
              {org.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono text-foreground-secondary">/{org.slug}</span>
              <span
                className={`pill ${
                  org.status === 'active'
                    ? 'bg-success-soft text-success'
                    : 'bg-warning-soft text-warning'
                }`}
              >
                {org.status}
              </span>
              <span className="pill bg-muted text-muted-foreground">plano: {org.plan}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <OrgNameForm initialName={org.name} disabled={!canManage} />
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              Você está como <span className="font-mono">{ctx.role}</span> — só owners e admins podem
              editar a organização.
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Conta</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">
              Dados básicos
            </h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Slug</dt>
                <dd className="font-mono text-foreground">{org.slug}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Plano</dt>
                <dd className="font-mono text-foreground">{org.plan}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-mono text-foreground">{org.status}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Criada em</dt>
                <dd className="numeral-serif text-foreground">
                  {new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }).format(org.createdAt)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-5">
            <p className="divider-eyebrow text-muted-foreground">Uso</p>
            <h3 className="mt-2 font-display text-base font-medium tracking-tight">Resumo</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Membros</dt>
                <dd className="numeral-serif text-foreground">{org._count.members}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Tickets criados</dt>
                <dd className="numeral-serif text-foreground">{org._count.tickets}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Próximo ticket #</dt>
                <dd className="numeral-serif text-foreground">{org.ticketSeq}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
