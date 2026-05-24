import Link from 'next/link';
import { logoutAction } from './logout-action';
import { OrgSwitcher } from './org-switcher';
import { NotificationsBell } from './notifications-bell';
import { listUserNotifications } from '@/src/services/notifications';
import type { OrgContext } from '@/src/lib/tenant';

export async function DashboardHeader({ ctx }: { ctx: OrgContext }) {
  const initials = (ctx.name ?? ctx.email)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  const notifications = await listUserNotifications(ctx.organizationId, ctx.userId, 20);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
      <div className="flex items-center gap-3">
        <OrgSwitcher current={ctx.organizationId} memberships={ctx.memberships} />
      </div>

      <div className="flex items-center gap-3">
        <NotificationsBell
          initialUnreadCount={notifications.unreadCount}
          initialItems={notifications.items}
        />

        <Link
          href="/settings/profile"
          className="group flex items-center gap-2 rounded-sm px-2 py-1 text-sm transition-colors hover:bg-muted"
          title="Meu perfil"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-surface-raised text-[0.6875rem] font-medium text-foreground-secondary">
            {initials || '?'}
          </span>
          <span className="hidden flex-col items-start leading-tight sm:flex">
            <span className="text-[0.8125rem] font-medium text-foreground group-hover:underline">
              {ctx.name}
            </span>
            <span className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
              {ctx.role}
            </span>
          </span>
        </Link>

        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-sm border border-border px-2.5 py-1 text-xs text-foreground-secondary transition-colors hover:border-border-strong hover:bg-muted hover:text-foreground"
            title="Sair"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
