import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrgContext } from '@/src/lib/tenant';
import { can, requirePermission } from '@/src/lib/permissions';
import { getTicketByCode } from '@/src/services/tickets/get';
import { listAssignableMembers } from '@/src/services/organizations/members';
import { listQueues } from '@/src/services/queues';
import { ReplyComposer } from './composer';
import { AiAssist } from './ai-assist';
import { EmailBody } from './email-body';
import { KbSuggestions } from './kb-suggestions';
import { TicketActionsBar } from './ticket-actions-bar';
import { DeleteTicketButton } from '../delete-ticket-button';
import { CopilotDrawer } from './copilot-drawer';
import { TicketContextPanel } from '@/src/components/layouts-builder/context-panel';
import { isAiConfigured } from '@/src/lib/gemini';
import { listMacros, renderMacroBody } from '@/src/services/macros';
import type { MacroOption } from './macros-picker';
import {
  STATUS_LABEL,
  STATUS_BADGE,
  PRIORITY_LABEL,
  PRIORITY_BADGE,
  formatDateTime,
  formatRelativeShort,
} from '@/src/lib/format';

export async function generateMetadata(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  return { title: `${code} — SmartDesk` };
}

export default async function TicketDetailPage(props: { params: Promise<{ code: string }> }) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:read');
  const { code } = await props.params;

  const ticket = await getTicketByCode(ctx.organizationId, code);
  if (!ticket) notFound();

  const [members, queues, hasGmail, hasWhatsapp] = await Promise.all([
    listAssignableMembers(ctx.organizationId),
    listQueues(ctx.organizationId),
    (async () => {
      const { prisma } = await import('@/src/lib/prisma');
      const [g, i] = await Promise.all([
        prisma.gmailConnection.findFirst({
          where: { organizationId: ctx.organizationId, status: 'active', deletedAt: null },
          select: { id: true },
        }),
        prisma.imapSmtpConnection.findFirst({
          where: { organizationId: ctx.organizationId, status: 'active', deletedAt: null },
          select: { id: true },
        }),
      ]);
      return g ?? i;
    })(),
    (await import('@/src/lib/prisma')).prisma.whatsappConnection.findFirst({
      where: { organizationId: ctx.organizationId, status: 'active', deletedAt: null },
      select: { id: true },
    }),
  ]);

  const macrosRaw = await listMacros(ctx.organizationId, true);
  const macros: MacroOption[] = macrosRaw.map((m) => ({
    id: m.id,
    name: m.name,
    shortcut: m.shortcut,
    bodyRendered: renderMacroBody(m.body, {
      ticket: {
        code: ticket.code,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        requester: {
          name: ticket.requester.name ?? null,
          email: ticket.requester.email ?? null,
        },
      },
      agent: { name: ctx.name, email: ctx.email },
      org: { name: ctx.organizationName },
    }),
    actionsCount: m.actions.length,
  }));

  const availableChannels: Array<'email' | 'whatsapp'> = [];
  if (hasGmail && ticket.requester.email) availableChannels.push('email');
  if (hasWhatsapp && ticket.requester.phone) availableChannels.push('whatsapp');
  const defaultChannel: 'email' | 'whatsapp' =
    ticket.origin === 'whatsapp' && availableChannels.includes('whatsapp')
      ? 'whatsapp'
      : availableChannels[0] ?? 'email';

  const sb = STATUS_BADGE[ticket.status];
  const pb = PRIORITY_BADGE[ticket.priority];

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <div className="flex items-center gap-3 text-xs">
          <Link href="/tickets" className="text-muted-foreground hover:text-foreground hover:underline">Tickets</Link>
          <span className="text-muted-foreground">/</span>
          <span className="numeral-serif text-[0.875rem] font-medium text-primary">{ticket.code}</span>
          <span className="pill" style={{ backgroundColor: sb.bg, color: sb.fg }}>
            {STATUS_LABEL[ticket.status]}
          </span>
          <span className="pill" style={{ backgroundColor: pb.bg, color: pb.fg }}>
            {PRIORITY_LABEL[ticket.priority]}
          </span>
          {ticket.queue ? (
            <span className="text-muted-foreground">· fila <span className="text-foreground">{ticket.queue.name}</span></span>
          ) : null}
        </div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">{ticket.subject}</h1>
      </header>

      <div className="flex items-start justify-between gap-3">
        <TicketActionsBar
          code={ticket.code}
          status={ticket.status}
          priority={ticket.priority}
          assigneeId={ticket.assigneeId}
          queueId={ticket.queueId}
          members={members.map((m) => ({ id: m.id, name: m.name, email: m.email }))}
          queues={queues.map((q) => ({ id: q.id, name: q.name }))}
          canUpdate={can(ctx.role, 'tickets:update')}
          canAssign={can(ctx.role, 'tickets:assign')}
        />
        {can(ctx.role, 'tickets:update') ? (
          <DeleteTicketButton ticketId={ticket.id} variant="bar" redirectTo="/tickets" />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Coluna principal */}
        <div className="flex flex-col gap-4">
          {/* Card "abertura": só pra tickets criados manualmente.
              Quando vem de canal externo (email/whatsapp/form), a 1ª mensagem
              já é a abertura e renderiza embaixo com HTML. */}
          {ticket.origin === 'manual' ? (
            <article className="card p-5">
              <header className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[0.6875rem] font-medium text-primary">
                  {((ticket.requester.name ?? ticket.requester.email) ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium text-foreground">{ticket.requester.name ?? ticket.requester.email ?? 'Solicitante'}</span>
                <span>·</span>
                <span>{formatDateTime(ticket.createdAt)}</span>
                <span className="ml-auto rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  abertura
                </span>
              </header>
              {ticket.description ? (
                <EmailBody html={null} text={ticket.description} textOnly />
              ) : (
                <p className="text-sm italic text-muted-foreground">sem descrição</p>
              )}
            </article>
          ) : null}

          <section className="flex flex-col gap-3">
            {ticket.messages.map((m) => {
              const kind = classifyMessage(m.type);
              const author = m.authorUser?.name ?? (kind.direction === 'in' ? ticket.requester.name ?? ticket.requester.email : 'Sistema');
              return (
                <article
                  key={m.id}
                  className={`rounded-md border p-5 shadow-xs ${kind.cardClass}`}
                >
                  <header className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.6875rem] font-medium ${kind.iconClass}`}>
                        {kind.icon}
                      </span>
                      <span className="font-medium text-foreground">{kind.label}</span>
                      <span className="text-muted-foreground">· {author}</span>
                      {m.channel ? (
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                          {m.channel}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                  </header>
                  <EmailBody
                    html={isEmailMessage(m) ? m.bodyHtml : null}
                    text={m.bodyText}
                    textOnly={!isEmailMessage(m)}
                  />
                  {m.attachments && m.attachments.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {m.attachments.map((a) => (
                        <li key={a.id}>
                          <a
                            href={`/api/attachments/${a.id}/download`}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2 py-1 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M11.5 6L7 10.5a2.5 2.5 0 1 1-3.5-3.5L9 1.5a4 4 0 0 1 5.5 5.5L9 12.5" />
                            </svg>
                            <span className="font-medium">{a.filename}</span>
                            <span className="text-muted-foreground">({formatBytesShort(a.sizeBytes)})</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {m.deliveryStatus === 'pending' ? (
                    <p className="mt-2 text-xs text-warning">Envio em fila…</p>
                  ) : m.deliveryStatus === 'failed' ? (
                    <p className="mt-2 text-xs text-destructive">Falha no envio: {m.deliveryError}</p>
                  ) : m.deliveryStatus === 'not_applicable' && kind.direction === 'out' ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Sem entrega — conecte um canal em Configurações.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </section>

          <ReplyComposer
            code={ticket.code}
            ticketId={ticket.id}
            canReply={can(ctx.role, 'tickets:reply')}
            defaultChannel={defaultChannel}
            availableChannels={availableChannels}
            macros={macros}
          />
        </div>

        {/* Coluna lateral — Painel Inteligente */}
        <aside className="flex flex-col gap-4">
          <AiAssist
            code={ticket.code}
            canSuggest={can(ctx.role, 'tickets:reply')}
            aiEnabled={isAiConfigured()}
          />
          <KbSuggestions
            organizationId={ctx.organizationId}
            organizationSlug={ctx.organizationSlug}
            ticketSubject={ticket.subject}
          />
          <TicketContextPanel organizationId={ctx.organizationId} ticketId={ticket.id} />

          <Card title="Atividade">
            <ul className="space-y-2 text-xs">
              {ticket.events.length === 0 ? (
                <li className="text-muted-foreground">—</li>
              ) : (
                ticket.events
                  .slice()
                  .reverse()
                  .slice(0, 15)
                  .map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2">
                      <span className="text-foreground">{describeEvent(e)}</span>
                      <span className="shrink-0 text-muted-foreground" title={e.createdAt.toISOString()}>
                        {formatRelativeShort(e.createdAt)}
                      </span>
                    </li>
                  ))
              )}
            </ul>
          </Card>
        </aside>
      </div>
      <CopilotDrawer ticketCode={ticket.code} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="divider-eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function classifyMessage(type: string): {
  label: string;
  icon: string;
  direction: 'in' | 'out' | 'internal';
  cardClass: string;
  iconClass: string;
} {
  switch (type) {
    case 'internal_note':
      return {
        label: 'Nota interna',
        icon: '!',
        direction: 'internal',
        cardClass: 'border-warning/30 bg-warning-soft/60',
        iconClass: 'bg-warning text-warning-soft',
      };
    case 'incoming_email':
      return {
        label: 'Email recebido',
        icon: '↓',
        direction: 'in',
        cardClass: 'border-border bg-surface',
        iconClass: 'bg-muted-foreground text-background',
      };
    case 'incoming_whatsapp':
      return {
        label: 'WhatsApp recebido',
        icon: '↓',
        direction: 'in',
        cardClass: 'border-success/30 bg-success-soft/30',
        iconClass: 'bg-success text-success-soft',
      };
    case 'outgoing_whatsapp':
      return {
        label: 'WhatsApp enviado',
        icon: '↑',
        direction: 'out',
        cardClass: 'border-success/30 bg-success-soft/20',
        iconClass: 'bg-success text-success-soft',
      };
    case 'public_reply':
    default:
      return {
        label: 'Resposta',
        icon: '↑',
        direction: 'out',
        cardClass: 'border-primary/20 bg-primary-soft/70',
        iconClass: 'bg-primary text-primary-foreground',
      };
  }
}

function describeEvent(e: { type: string; payload: unknown }): string {
  const p = (e.payload as Record<string, unknown>) ?? {};
  switch (e.type) {
    case 'created':
      return `Ticket criado (${String(p.origin ?? 'manual')})`;
    case 'status_changed':
      return `Status: ${String(p.from)} → ${String(p.to)}`;
    case 'priority_changed':
      return `Prioridade: ${String(p.from)} → ${String(p.to)}`;
    case 'assignee_changed':
      return p.to ? `Atribuído` : 'Desatribuído';
    case 'queue_changed':
      return `Fila alterada`;
    case 'message_added':
      return p.type === 'internal_note' ? 'Nota interna' : 'Resposta';
    case 'rule_applied':
      return `Regra aplicada`;
    case 'enrichment_completed':
      return `Enriquecimento concluído`;
    default:
      return e.type;
  }
}

function isEmailMessage(m: { type: string; channel: string | null }): boolean {
  if (m.channel === 'email') return true;
  return m.type === 'incoming_email' || m.type === 'public_reply';
}

function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
