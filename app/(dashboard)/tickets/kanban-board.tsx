'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { TicketStatus, TicketPriority } from '@prisma/client';
import { moveTicketAction } from './actions';
import { RoutingRuleButton } from './routing-rule-dialog';
import { DeleteTicketButton } from './delete-ticket-button';
import { STATUS_BADGE, PRIORITY_BADGE, PRIORITY_LABEL, formatRelativeShort } from '@/src/lib/format';

export type KanbanTicket = {
  id: string;
  code: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  origin: string;
  updatedAt: Date;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  assigneeName: string | null;
};

const COLUMNS: Array<{ status: TicketStatus; label: string }> = [
  { status: 'new', label: 'Novo' },
  { status: 'open', label: 'Aberto' },
  { status: 'in_progress', label: 'Em progresso' },
  { status: 'pending_customer', label: 'Aguardando cliente' },
  { status: 'pending_third_party', label: 'Aguardando 3ª parte' },
  { status: 'resolved', label: 'Resolvido' },
  { status: 'closed', label: 'Fechado' },
];

const DONE_STATUSES = new Set<TicketStatus>(['resolved', 'closed']);

function initials(name: string | null, email: string | null): string {
  const src = (name ?? email ?? '?').trim();
  return src.slice(0, 1).toUpperCase();
}

export function KanbanBoard({
  tickets,
  canMove,
  canRoute = false,
}: {
  tickets: KanbanTicket[];
  canMove: boolean;
  canRoute?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Otimismo local: aplica o movimento imediatamente; sincroniza quando o server muda.
  const [localTickets, setLocalTickets] = useState(tickets);
  if (tickets !== localTickets && tickets.length !== localTickets.length) {
    setLocalTickets(tickets);
  }

  const byStatus = new Map<TicketStatus, KanbanTicket[]>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const t of localTickets) {
    byStatus.get(t.status)?.push(t);
  }

  function handleDrop(targetStatus: TicketStatus, ticketId: string) {
    setError(null);
    const ticket = localTickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;

    setLocalTickets((curr) =>
      curr.map((t) => (t.id === ticketId ? { ...t, status: targetStatus } : t)),
    );

    startTransition(async () => {
      const r = await moveTicketAction({ ticketId, status: targetStatus });
      if (!r.ok) {
        setLocalTickets((curr) =>
          curr.map((t) => (t.id === ticketId ? { ...t, status: ticket.status } : t)),
        );
        setError(r.error);
        setTimeout(() => setError(null), 4000);
      } else {
        router.refresh();
      }
    });
  }

  const draggingStatus = draggingId
    ? localTickets.find((t) => t.id === draggingId)?.status ?? null
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-5 shrink-0 items-center gap-3">
        {error ? (
          <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-1.5 text-xs text-destructive">
            ⚠ {error}
          </p>
        ) : null}
        {pending ? <p className="text-[0.6875rem] text-muted-foreground">↻ salvando…</p> : null}
        {canMove && !error && !pending ? (
          <p className="text-[0.6875rem] text-muted-foreground">Arraste os cards entre as colunas para mudar o status.</p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const items = byStatus.get(col.status) ?? [];
          const badge = STATUS_BADGE[col.status];
          const isOver = dragOver === col.status;
          const isDone = DONE_STATUSES.has(col.status);
          const canDropHere = canMove && draggingId !== null && draggingStatus !== col.status;

          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (!canMove || !draggingId) return;
                e.preventDefault();
                if (dragOver !== col.status) setDragOver(col.status);
              }}
              onDragLeave={(e) => {
                // só limpa se o ponteiro saiu de fato da coluna (não pra um filho)
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragOver((s) => (s === col.status ? null : s));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                setDragOver(null);
                setDraggingId(null);
                if (id && canMove) handleDrop(col.status, id);
              }}
              className={[
                'flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-md border bg-surface-raised transition-all',
                isOver
                  ? 'border-primary shadow-md ring-2 ring-primary/25'
                  : 'border-border',
                isDone && !isOver ? 'opacity-90' : '',
              ].join(' ')}
            >
              {/* faixa de cor do status */}
              <div style={{ height: 3, backgroundColor: badge.fg }} aria-hidden />

              <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: badge.fg }}
                    aria-hidden
                  />
                  <p className="text-xs font-semibold tracking-tight text-foreground">{col.label}</p>
                </div>
                <span
                  className="numeral-serif inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-medium"
                  style={{ backgroundColor: badge.bg, color: badge.fg }}
                >
                  {items.length}
                </span>
              </header>

              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                {items.length === 0 && !canDropHere ? (
                  <p className="rounded-sm border border-dashed border-border bg-surface/50 p-4 text-center text-[0.6875rem] text-muted-foreground">
                    vazio
                  </p>
                ) : (
                  items.map((t) => {
                    const pBadge = PRIORITY_BADGE[t.priority];
                    return (
                      <article
                        key={t.id}
                        draggable={canMove}
                        onDragStart={(e) => {
                          if (!canMove) return;
                          e.dataTransfer.setData('text/plain', t.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggingId(t.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOver(null);
                        }}
                        style={{ borderLeftColor: pBadge.fg, borderLeftWidth: 3 }}
                        className={[
                          'group rounded-sm border border-border bg-surface p-2.5 transition-all',
                          canMove ? 'cursor-grab active:cursor-grabbing hover:border-border-strong hover:shadow-sm' : '',
                          draggingId === t.id ? 'opacity-40' : '',
                        ].join(' ')}
                      >
                        <Link href={`/tickets/${t.code}`} className="block">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[0.6875rem] text-muted-foreground">{t.code}</span>
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium"
                              style={{ backgroundColor: pBadge.bg, color: pBadge.fg }}
                            >
                              {PRIORITY_LABEL[t.priority]}
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-foreground">{t.subject}</p>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[0.6875rem] text-muted-foreground">
                            <span className="truncate">
                              {t.requesterName || t.requesterEmail || 'sem solicitante'}
                            </span>
                            <span className="shrink-0 tabular-nums">{formatRelativeShort(t.updatedAt)}</span>
                          </div>
                          {t.assigneeName ? (
                            <div className="mt-2 flex items-center gap-1.5 border-t border-border-subtle pt-1.5">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-soft text-[0.5625rem] font-medium text-primary">
                                {initials(t.assigneeName, null)}
                              </span>
                              <span className="truncate text-[0.6875rem] text-foreground-secondary">{t.assigneeName}</span>
                            </div>
                          ) : null}
                        </Link>
                        {canRoute ? (
                          <div className="mt-2 flex items-center justify-end gap-1 border-t border-border-subtle pt-1.5">
                            <RoutingRuleButton
                              variant="card"
                              ticketId={t.id}
                              requesterName={t.requesterName}
                              email={t.requesterEmail}
                              phone={t.requesterPhone}
                            />
                            <DeleteTicketButton ticketId={t.id} variant="card" />
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}

                {/* zona de soltar ao arrastar */}
                {canDropHere ? (
                  <div
                    className={[
                      'rounded-sm border border-dashed px-3 py-3 text-center text-[0.6875rem] transition-colors',
                      isOver
                        ? 'border-primary bg-primary-soft/40 text-primary'
                        : 'border-border text-muted-foreground',
                    ].join(' ')}
                  >
                    {isOver ? '↓ soltar aqui' : 'mover para cá'}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
