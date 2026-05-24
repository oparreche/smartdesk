'use client';

import { useTransition } from 'react';
import { changeRoleAction } from './actions';

export function RoleSelect({
  id,
  role,
  disabled,
}: {
  id: string;
  role: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select
        name="role"
        defaultValue={role}
        disabled={disabled || pending}
        onChange={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          const fd = new FormData(form);
          startTransition(() => changeRoleAction(fd));
        }}
        className="rounded-sm border border-border bg-surface-raised px-2 py-1 text-xs shadow-xs disabled:opacity-50"
      >
        <option value="owner">owner</option>
        <option value="admin">admin</option>
        <option value="supervisor">supervisor</option>
        <option value="agent">agent</option>
        <option value="viewer">viewer</option>
      </select>
    </form>
  );
}
