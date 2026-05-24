import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/src/lib/prisma';
import { getPortalSession } from '@/src/services/portal/auth';
import { formatDateTime } from '@/src/lib/format';
import { MagicLinkForm } from './magic-link-form';

export const metadata = { title: 'Portal de atendimento' };

export default async function PortalHome(props: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await props.params;
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  if (!org) notFound();

  const session = await getPortalSession();
  const isAuth = session && session.organizationSlug === org.slug;

  if (!isAuth) {
    return (
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Acesse seus chamados
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Informe seu email cadastrado. Enviaremos um link de acesso (válido
            por 30 minutos) — sem senha.
          </p>
        </header>
        <div className="card p-6">
          <MagicLinkForm organizationSlug={org.slug} />
        </div>
      </div>
    );
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: org.id,
      requesterId: session.requesterId,
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      code: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const openTickets = tickets.filter(
    (t) => !['resolved', 'closed', 'cancelled'].includes(t.status),
  );
  const closedTickets = tickets.filter((t) =>
    ['resolved', 'closed', 'cancelled'].includes(t.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Olá{session.name ? `, ${session.name}` : ''}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Seus chamados
        </h1>
      </header>

      <Link
        href={`/portal/${org.slug}/novo`}
        className="inline-flex w-fit items-center gap-2 self-start rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
      >
        ＋ Abrir novo chamado
      </Link>

      {openTickets.length > 0 ? (
        <section className="card overflow-hidden">
          <header className="border-b border-border bg-surface-raised px-5 py-3">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              Em andamento · {openTickets.length}
            </p>
          </header>
          <ul className="divide-y divide-border-subtle">
            {openTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/${org.slug}/ticket/${t.code}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40"
                >
                  <span className="numeral-serif w-20 shrink-0 text-[0.8125rem] font-medium text-primary">
                    {t.code.replace('HELP-', '#')}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{t.subject}</span>
                  <StatusPill status={t.status} />
                  <span className="hidden text-[0.6875rem] text-muted-foreground sm:inline">
                    {formatDateTime(t.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          Você não tem chamados em andamento.
        </div>
      )}

      {closedTickets.length > 0 ? (
        <section className="card overflow-hidden">
          <header className="border-b border-border bg-surface-raised px-5 py-3">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              Histórico · {closedTickets.length}
            </p>
          </header>
          <ul className="divide-y divide-border-subtle">
            {closedTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/${org.slug}/ticket/${t.code}`}
                  className="flex items-center gap-3 px-5 py-3 opacity-70 hover:bg-muted/40 hover:opacity-100"
                >
                  <span className="numeral-serif w-20 shrink-0 text-[0.8125rem] font-medium text-primary">
                    {t.code.replace('HELP-', '#')}
                  </span>
                  <span className="flex-1 truncate text-sm">{t.subject}</span>
                  <StatusPill status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    new: { label: 'Novo', bg: '#e3eaf9', fg: '#1c2541' },
    open: { label: 'Aberto', bg: '#e3eaf9', fg: '#1c2541' },
    in_progress: { label: 'Em atendimento', bg: '#faf0d8', fg: '#83580f' },
    pending_customer: { label: 'Aguardando você', bg: '#fbe0e1', fg: '#9c1f24' },
    pending_third_party: { label: 'Aguardando terceiro', bg: '#faf0d8', fg: '#83580f' },
    resolved: { label: 'Resolvido', bg: '#e3f1ea', fg: '#1d6d56' },
    closed: { label: 'Fechado', bg: '#ebe8df', fg: '#4a4c54' },
    cancelled: { label: 'Cancelado', bg: '#ebe8df', fg: '#4a4c54' },
  };
  const m = map[status] ?? { label: status, bg: '#ebe8df', fg: '#4a4c54' };
  return (
    <span
      className="pill shrink-0"
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
