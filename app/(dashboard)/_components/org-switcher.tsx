'use client';

import { useTransition } from 'react';
import { setActiveOrganizationAction } from './org-switcher-action';
import type { SessionUserMembership } from '@/auth';

export function OrgSwitcher({
  current,
  memberships,
}: {
  current: string;
  memberships: SessionUserMembership[];
}) {
  const [pending, startTransition] = useTransition();
  const active = memberships.find((m) => m.organizationId === current) ?? memberships[0];

  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary/10 text-[0.6875rem] font-medium text-primary">
          {(active?.organizationName ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="leading-tight">
          <span className="block text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
            Organização
          </span>
          <span className="block text-sm font-medium text-foreground" title={active?.organizationSlug}>
            {active?.organizationName ?? '—'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <form
      action={(fd) => startTransition(() => setActiveOrganizationAction(fd))}
      className="flex items-center gap-2.5"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary/10 text-[0.6875rem] font-medium text-primary">
        {(active?.organizationName ?? '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="leading-tight">
        <span className="block text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
          Organização
        </span>
        <select
          name="organizationId"
          defaultValue={current}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-foreground outline-none hover:text-primary focus:text-primary"
        >
          {memberships.map((m) => (
            <option key={m.organizationId} value={m.organizationId}>
              {m.organizationName} ({m.role})
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
