import Link from 'next/link';
import { getOrgContext } from '@/src/lib/tenant';
import { can, requirePermission } from '@/src/lib/permissions';
import { prisma } from '@/src/lib/prisma';
import { listTickets } from '@/src/services/tickets/list';
import { listQueues } from '@/src/services/queues';
import { listAssignableMembers } from '@/src/services/organizations/members';
import { listSavedFilters } from '@/src/services/saved-filters';
import { SavedFiltersBar, type SavedFilterItem } from './saved-filters-bar';
import { ViewToggle } from './view-toggle';
import { KanbanBoard, type KanbanTicket } from './kanban-board';
import { RoutingRuleDialog, RoutingRuleButton } from './routing-rule-dialog';
import {
  STATUS_LABEL,
  STATUS_BADGE,
  PRIORITY_LABEL,
  PRIORITY_BADGE,
  formatRelativeShort,
} from '@/src/lib/format';
import type { TicketStatus, TicketPriority } from '@prisma/client';

export const metadata = { title: 'Tickets — SmartDesk' };

const STATUS_VALUES: TicketStatus[] = [
  'new', 'open', 'in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'closed', 'cancelled',
];
const PRIORITY_VALUES: TicketPriority[] = ['low', 'normal', 'high', 'urgent', 'critical'];

type SearchParams = Record<string, string | string[] | undefined>;

function parseSearch(searchParams: SearchParams) {
  const arr = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : [];
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  return {
    status: arr(searchParams.status).filter((s): s is TicketStatus =>
      (STATUS_VALUES as string[]).includes(s),
    ),
    priority: arr(searchParams.priority).filter((p): p is TicketPriority =>
      (PRIORITY_VALUES as string[]).includes(p),
    ),
    queueId: one(searchParams.queueId),
    assignee: one(searchParams.assignee),
    search: one(searchParams.q),
    page: Number(one(searchParams.page) ?? 1),
  };
}

export default async function TicketsListPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getOrgContext();
  requirePermission(ctx.role, 'tickets:read');

  const sp = await props.searchParams;
  const filters = parseSearch(sp);

  // View: query param override > user preference > 'list'
  const userPref = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { defaultTicketView: true },
  });
  const explicit = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const view: 'list' | 'kanban' =
    explicit === 'kanban' || explicit === 'list'
      ? explicit
      : (userPref?.defaultTicketView ?? 'list');

  // Pra kanban precisamos de mais tickets (sem paginação tradicional)
  const pageSize = view === 'kanban' ? 200 : 25;

  const canRoute = can(ctx.role, 'tickets:update');

  const [result, queues, saved, agents] = await Promise.all([
    listTickets(
      ctx.organizationId,
      ctx.userId,
      {
        status: filters.status.length ? filters.status : undefined,
        priority: filters.priority.length ? filters.priority : undefined,
        queueId: filters.queueId,
        assigneeId: filters.assignee as 'me' | 'unassigned' | undefined,
        search: filters.search,
      },
      { page: view === 'kanban' ? 1 : filters.page, pageSize },
    ),
    listQueues(ctx.organizationId),
    listSavedFilters(ctx.organizationId, ctx.userId, 'tickets'),
    canRoute ? listAssignableMembers(ctx.organizationId) : Promise.resolve([]),
  ]);

  const queueOptions = queues.map((q) => ({ slug: q.slug, name: q.name }));
  const agentOptions = agents.map((a) => ({ email: a.email, name: a.name }));

  const savedFilters: SavedFilterItem[] = saved.map((s) => ({
    id: s.id,
    name: s.name,
    params: (s.params as Record<string, string | string[]>) ?? {},
    shared: s.userId === null,
  }));

  const currentParams: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page') continue;
    if (v === undefined) continue;
    currentParams[k] = v;
  }

  const now = new Date();

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <p className="divider-eyebrow text-muted-foreground">Workspace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} resultado{result.total === 1 ? '' : 's'} · página {result.page} de {result.totalPages}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle current={view} />
          <Link
            href="/tickets/new"
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:shadow-md active:translate-y-px"
          >
            Novo ticket <span aria-hidden className="font-mono text-xs">＋</span>
          </Link>
        </div>
      </header>

      <SavedFiltersBar
        filters={savedFilters}
        canShare={can(ctx.role, 'organization:manage')}
        currentParams={currentParams}
      />

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <FilterField label="Busca">
          <input
            name="q"
            defaultValue={filters.search ?? ''}
            placeholder="Código, assunto, email…"
            className="w-56 rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-primary"
          />
        </FilterField>
        <FilterField label="Status">
          <MultiSelect name="status" values={filters.status}>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </MultiSelect>
        </FilterField>
        <FilterField label="Prioridade">
          <MultiSelect name="priority" values={filters.priority}>
            {PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </MultiSelect>
        </FilterField>
        <FilterField label="Fila">
          <select
            name="queueId"
            defaultValue={filters.queueId ?? ''}
            className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-primary"
          >
            <option value="">Todas</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Atribuído">
          <select
            name="assignee"
            defaultValue={filters.assignee ?? ''}
            className="rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-sm shadow-xs outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            <option value="me">Meus</option>
            <option value="unassigned">Sem responsável</option>
          </select>
        </FilterField>
        <button
          type="submit"
          className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md"
        >
          Filtrar
        </button>
        <Link href="/tickets" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          limpar
        </Link>
      </form>

      {view === 'kanban' ? (
        <KanbanBoard
          canMove={canRoute}
          canRoute={canRoute}
          tickets={result.rows.map<KanbanTicket>((r) => ({
            id: r.id,
            code: r.code,
            subject: r.subject,
            status: r.status,
            priority: r.priority,
            origin: r.origin,
            updatedAt: r.updatedAt,
            requesterName: r.requester.name,
            requesterEmail: r.requester.email,
            requesterPhone: r.requester.phone,
            assigneeName: r.assignee?.name ?? null,
          }))}
        />
      ) : (
      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left">
            <tr className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Assunto</th>
              <th className="px-4 py-3 font-medium">Solicitante</th>
              <th className="px-4 py-3 font-medium">Fila</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Prioridade</th>
              <th className="px-4 py-3 font-medium">Responsável</th>
              <th className="px-4 py-3 font-medium text-right">Atualizado</th>
              {canRoute ? <th className="px-4 py-3 font-medium text-right" aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={canRoute ? 9 : 8} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  Nenhum ticket com os filtros atuais.
                </td>
              </tr>
            ) : (
              result.rows.map((t) => {
                const sb = STATUS_BADGE[t.status];
                const pb = PRIORITY_BADGE[t.priority];
                return (
                  <tr key={t.id} className="border-t border-border-subtle transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/tickets/${t.code}`} className="numeral-serif text-[0.8125rem] font-medium text-primary hover:underline">
                        {t.code}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3">
                      <Link href={`/tickets/${t.code}`} className="font-medium hover:underline">
                        {t.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="text-foreground">{t.requester.name ?? '—'}</div>
                      <div className="text-xs">{t.requester.email ?? ''}</div>
                    </td>
                    <td className="px-4 py-3">{t.queue?.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">
                      <Badge bg={sb.bg} fg={sb.fg}>{STATUS_LABEL[t.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge bg={pb.bg} fg={pb.fg}>{PRIORITY_LABEL[t.priority]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {t.assignee?.name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground" title={t.updatedAt.toISOString()}>
                      {formatRelativeShort(t.updatedAt, now)}
                    </td>
                    {canRoute ? (
                      <td className="px-2 py-3 text-right">
                        <RoutingRuleButton
                          ticketId={t.id}
                          requesterName={t.requester.name}
                          email={t.requester.email}
                          phone={t.requester.phone}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      )}

      {view === 'list' ? (
        <footer className="flex items-center justify-end">
          <Pagination current={result.page} total={result.totalPages} searchParams={sp} />
        </footer>
      ) : null}

      {canRoute ? (
        <RoutingRuleDialog queues={queueOptions} agents={agentOptions} />
      ) : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function MultiSelect({
  name,
  values,
  children,
}: {
  name: string;
  values: string[];
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      multiple
      defaultValue={values}
      className="h-9 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
      size={1}
    >
      {children}
    </select>
  );
}

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      className="pill"
      style={{ backgroundColor: bg, color: fg }}
    >
      {children}
    </span>
  );
}

function Pagination({
  current,
  total,
  searchParams,
}: {
  current: number;
  total: number;
  searchParams: SearchParams;
}) {
  function withPage(p: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page') continue;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else if (v) params.set(k, v);
    }
    params.set('page', String(p));
    return `/tickets?${params.toString()}`;
  }
  if (total <= 1) return null;
  return (
    <nav className="flex items-center gap-1 text-xs">
      <a
        href={withPage(Math.max(1, current - 1))}
        aria-disabled={current === 1}
        className={`rounded-sm border border-border bg-surface px-2.5 py-1 font-mono ${current === 1 ? 'pointer-events-none opacity-40' : 'hover:border-border-strong hover:bg-muted'}`}
      >
        ←
      </a>
      <span className="px-2 font-mono text-muted-foreground">
        {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
      <a
        href={withPage(Math.min(total, current + 1))}
        aria-disabled={current === total}
        className={`rounded-sm border border-border bg-surface px-2.5 py-1 font-mono ${current === total ? 'pointer-events-none opacity-40' : 'hover:border-border-strong hover:bg-muted'}`}
      >
        →
      </a>
    </nav>
  );
}
