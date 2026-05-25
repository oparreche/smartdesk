'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { TicketStatus, TicketPriority } from '@prisma/client';
import { moveTicketAction } from './actions';
import { RoutingRuleButton } from './routing-rule-dialog';
import { DeleteTicketButton } from './delete-ticket-button';
import { STATUS_LABEL, STATUS_BADGE, PRIORITY_BADGE, PRIORITY_LABEL, formatRelativeShort } from '@/src/lib/format';

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
  const [error, setError] = useState<string | null>(null);

  // Otimismo local: quando o usuário arrasta, movemos imediatamente no estado.
  const [localTickets, setLocalTickets] = useState(tickets);
  // Sincroniza quando server props mudam (após revalidatePath)
  if (tickets !== localTickets && tickets.length !== localTickets.length) {
    // simples — recarrega
    setLocalTickets(tickets);
  }

  const byStatus = new Map<TicketStatus, KanbanTicket[]>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const t of localTickets) {
    const arr = byStatus.get(t.status);
    if (arr) arr.push(t);
  }

  function handleDrop(targetStatus: TicketStatus, ticketId: string) {
    setError(null);
    const ticket = localTickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;

    // Otimismo: aplica mudança local
    setLocalTickets((curr) =>
      curr.map((t) => (t.id === ticketId ? { ...t, status: targetStatus } : t)),
    );

    startTransition(async () => {
      const r = await moveTicketAction({ ticketId, status: targetStatus });
      if (!r.ok) {
        // Rollback
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

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive">
          ⚠ {error}
        </p>
      ) : null}
      {pending ? (
        <p className="text-[0.6875rem] text-muted-foreground">↻ salvando…</p>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((col) => {
          const items = byStatus.get(col.status) ?? [];
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                if (canMove) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id && canMove) handleDrop(col.status, id);
                setDraggingId(null);
              }}
              className="flex w-72 shrink-0 flex-col gap-2 rounded-sm border border-border bg-surface-raised p-2"
            >
              <header className="flex items-baseline justify-between px-1">
                <p className="text-xs font-medium text-foreground">{col.label}</p>
                <span className="numeral-serif text-xs text-muted-foreground">{items.length}</span>
              </header>
              <div className="flex flex-col gap-1.5">
                {items.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border bg-surface/50 p-3 text-center text-[0.6875rem] text-muted-foreground">
                    vazio
                  </p>
                ) : (
                  items.map((t) => (
                    <article
                      key={t.id}
                      draggable={canMove}
                      onDragStart={(e) => {
                        if (!canMove) return;
                        e.dataTransfer.setData('text/plain', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingId(t.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={[
                        'rounded-sm border border-border bg-surface p-2.5 transition-all',
                        canMove ? 'cursor-grab active:cursor-grabbing hover:border-border-strong hover:shadow-sm' : '',
                        draggingId === t.id ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <Link href={`/tickets/${t.code}`} className="block">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[0.6875rem] text-primary">{t.code}</span>
                          <span className={`pill ${PRIORITY_BADGE[t.priority]}`}>
                            {PRIORITY_LABEL[t.priority]}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-foreground">{t.subject}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
                          <span className="truncate">
                            {t.requesterName || t.requesterEmail || 'sem solicitante'}
                          </span>
                          <span>· {formatRelativeShort(t.updatedAt)}</span>
                        </div>
                        {t.assigneeName ? (
                          <p className="mt-1 text-[0.6875rem] text-foreground-secondary">
                            @ {t.assigneeName}
                          </p>
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
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
