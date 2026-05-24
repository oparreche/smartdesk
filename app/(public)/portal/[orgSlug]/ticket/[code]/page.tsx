import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/src/lib/prisma';
import { getPortalSession } from '@/src/services/portal/auth';
import { formatDateTime } from '@/src/lib/format';

export const metadata = { title: 'Chamado' };

export default async function PortalTicketPage(props: {
  params: Promise<{ orgSlug: string; code: string }>;
}) {
  const { orgSlug, code } = await props.params;
  const session = await getPortalSession();
  if (!session || session.organizationSlug !== orgSlug) {
    redirect(`/portal/${orgSlug}`);
  }

  const ticket = await prisma.ticket.findFirst({
    where: {
      organizationId: session.organizationId,
      requesterId: session.requesterId,
      code,
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        where: { type: { in: ['incoming_email', 'public_reply'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          bodyText: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/portal/${orgSlug}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← seus chamados
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="numeral-serif text-base font-medium text-primary">
            {ticket.code}
          </span>
          <StatusPill status={ticket.status} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {ticket.subject}
        </h1>
        <p className="text-xs text-muted-foreground">
          Aberto em {formatDateTime(ticket.createdAt)} · última atualização{' '}
          {formatDateTime(ticket.updatedAt)}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {ticket.messages.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted-foreground">
            Sem mensagens ainda.
          </div>
        ) : (
          ticket.messages.map((m) => {
            const isYou = m.type === 'incoming_email';
            const author = isYou
              ? 'Você'
              : m.authorUser?.name ?? 'Equipe de atendimento';
            return (
              <article
                key={m.id}
                className={`rounded-md border p-5 shadow-xs ${
                  isYou
                    ? 'border-border bg-surface'
                    : 'border-primary/20 bg-primary-soft/30'
                }`}
              >
                <header className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">{author}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(m.createdAt)}
                  </span>
                </header>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.bodyText ?? ''}
                </p>
              </article>
            );
          })
        )}
      </section>

      {['resolved', 'closed', 'cancelled'].includes(ticket.status) ? (
        <div className="rounded-sm border border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Esse chamado está fechado. Pra abrir um novo, use{' '}
          <Link
            href={`/portal/${orgSlug}/novo`}
            className="text-primary hover:underline"
          >
            Abrir novo chamado
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-sm border border-border bg-surface p-4 text-center text-xs text-muted-foreground">
          Pra responder, envie email pra equipe de atendimento — sua resposta
          aparece aqui automaticamente.
        </div>
      )}
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
      className="pill"
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
