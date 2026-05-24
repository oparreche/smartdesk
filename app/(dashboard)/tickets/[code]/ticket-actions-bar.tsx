'use client';

import { useTransition } from 'react';
import {
  changeStatusAction,
  changePriorityAction,
  changeAssigneeAction,
  changeQueueAction,
} from './actions';
import type { TicketStatus, TicketPriority } from '@prisma/client';
import { STATUS_LABEL, PRIORITY_LABEL } from '@/src/lib/format';

type Props = {
  code: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  queueId: string | null;
  members: { id: string; name: string; email: string }[];
  queues: { id: string; name: string }[];
  canUpdate: boolean;
  canAssign: boolean;
};

const ALL_STATUS: TicketStatus[] = [
  'new', 'open', 'in_progress', 'pending_customer', 'pending_third_party', 'resolved', 'closed', 'cancelled',
];
const ALL_PRIORITY: TicketPriority[] = ['low', 'normal', 'high', 'urgent', 'critical'];

export function TicketActionsBar({
  code,
  status,
  priority,
  assigneeId,
  queueId,
  members,
  queues,
  canUpdate,
  canAssign,
}: Props) {
  const [pending, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    startTransition(() => {
      const fd = new FormData(form);
      const action = form.dataset.action;
      if (action === 'status') changeStatusAction(fd);
      else if (action === 'priority') changePriorityAction(fd);
      else if (action === 'assignee') changeAssigneeAction(fd);
      else if (action === 'queue') changeQueueAction(fd);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-background p-3">
      <ActionSelect
        label="Status"
        name="status"
        action="status"
        code={code}
        value={status}
        disabled={!canUpdate || pending}
        onSubmit={submit}
      >
        {ALL_STATUS.map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </ActionSelect>

      <ActionSelect
        label="Prioridade"
        name="priority"
        action="priority"
        code={code}
        value={priority}
        disabled={!canUpdate || pending}
        onSubmit={submit}
      >
        {ALL_PRIORITY.map((p) => (
          <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
        ))}
      </ActionSelect>

      <ActionSelect
        label="Fila"
        name="queueId"
        action="queue"
        code={code}
        value={queueId ?? ''}
        disabled={!canUpdate || pending}
        onSubmit={submit}
      >
        <option value="">— sem fila —</option>
        {queues.map((q) => (
          <option key={q.id} value={q.id}>{q.name}</option>
        ))}
      </ActionSelect>

      <ActionSelect
        label="Responsável"
        name="assigneeId"
        action="assignee"
        code={code}
        value={assigneeId ?? ''}
        disabled={!canAssign || pending}
        onSubmit={submit}
      >
        <option value="">— ninguém —</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </ActionSelect>
    </div>
  );
}

function ActionSelect({
  label,
  name,
  action,
  code,
  value,
  disabled,
  onSubmit,
  children,
}: {
  label: string;
  name: string;
  action: 'status' | 'priority' | 'assignee' | 'queue';
  code: string;
  value: string;
  disabled?: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      data-action={action}
      onChange={(e) => onSubmit(e.currentTarget)}
      className="flex flex-col gap-1"
    >
      <input type="hidden" name="code" value={code} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={() => {}}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
      >
        {children}
      </select>
    </form>
  );
}
