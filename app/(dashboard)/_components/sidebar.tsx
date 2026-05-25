'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { OrgRole } from '@prisma/client';
import { can, type Permission } from '@/src/lib/permissions';
import { toggleSidebarAction } from './sidebar-action';
import { NavIcon, type IconName } from './nav-icons';

type NavItem = {
  label: string;
  href: string;
  permission: Permission;
  icon: IconName;
};

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', permission: 'tickets:read', icon: 'dashboard' },
  { label: 'Tickets', href: '/tickets', permission: 'tickets:read', icon: 'tickets' },
  { label: 'Copilot', href: '/copilot', permission: 'tickets:read', icon: 'rules' },
  { label: 'Integrações', href: '/integrations', permission: 'integrations:read', icon: 'integrations' },
  { label: 'Painel Inteligente', href: '/layouts', permission: 'layouts:read', icon: 'layouts' },
  { label: 'Formulários', href: '/forms', permission: 'forms:read', icon: 'forms' },
  { label: 'Regras', href: '/rules', permission: 'rules:read', icon: 'rules' },
];

const SETTINGS: NavItem[] = [
  { label: 'Usuários', href: '/settings/users', permission: 'users:manage', icon: 'users' },
  { label: 'Gmail', href: '/settings/gmail', permission: 'gmail:manage', icon: 'gmail' },
  { label: 'IMAP / SMTP', href: '/settings/imap', permission: 'gmail:manage', icon: 'gmail' },
  { label: 'WhatsApp', href: '/settings/whatsapp', permission: 'whatsapp:manage', icon: 'whatsapp' },
  { label: 'Macros', href: '/settings/macros', permission: 'rules:write', icon: 'rules' },
  { label: 'Knowledge', href: '/knowledge', permission: 'rules:write', icon: 'rules' },
  { label: 'Filas', href: '/settings/queues', permission: 'queues:manage', icon: 'queues' },
  { label: 'Tags', href: '/settings/tags', permission: 'tags:manage', icon: 'tags' },
  { label: 'Webhooks', href: '/settings/webhooks', permission: 'organization:manage', icon: 'rules' },
  { label: 'API keys', href: '/settings/api-keys', permission: 'organization:manage', icon: 'rules' },
  { label: 'Auditoria', href: '/settings/audit', permission: 'audit:read', icon: 'audit' },
  { label: 'LGPD', href: '/settings/lgpd', permission: 'organization:manage', icon: 'lgpd' },
  { label: 'Organização', href: '/settings/organization', permission: 'organization:manage', icon: 'organization' },
];

export function Sidebar({ role, collapsed }: { role: OrgRole; collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={`group/sidebar relative hidden shrink-0 flex-col bg-dark-bg text-dark-foreground transition-[width] duration-200 ease-out md:flex ${
        collapsed ? 'w-[60px]' : 'w-60'
      }`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* Brand */}
      <div className="flex h-14 items-center border-b border-dark-border px-3">
        <Link
          href="/dashboard"
          className={`group flex items-center gap-2.5 ${collapsed ? 'mx-auto' : 'px-1.5'}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-dark-foreground text-dark-bg transition-transform group-hover:rotate-[-4deg]">
            <span className="font-display text-[1.05rem] font-semibold leading-none tracking-tight">S</span>
          </span>
          {!collapsed ? (
            <span className="font-display text-[1.1rem] font-semibold tracking-tight">SmartDesk</span>
          ) : null}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm">
        {!collapsed ? (
          <p className="mb-2 px-3 text-[0.6875rem] uppercase tracking-widest text-dark-foreground-muted">
            Workspace
          </p>
        ) : null}
        <ul className="space-y-px">
          {NAV.filter((n) => can(role, n.permission)).map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </ul>

        {SETTINGS.some((s) => can(role, s.permission)) ? (
          <>
            {!collapsed ? (
              <p className="mb-2 mt-6 px-3 text-[0.6875rem] uppercase tracking-widest text-dark-foreground-muted">
                Configurações
              </p>
            ) : (
              <div className="my-4 mx-auto h-px w-6 bg-dark-border" aria-hidden />
            )}
            <ul className="space-y-px">
              {SETTINGS.filter((n) => can(role, n.permission)).map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  collapsed={collapsed}
                />
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="flex items-center justify-between border-t border-dark-border px-3 py-3">
        {!collapsed ? (
          <p className="text-[0.6875rem] uppercase tracking-widest text-dark-foreground-muted">
            v0.1 · MVP
          </p>
        ) : null}
        <form action={toggleSidebarAction} className={collapsed ? 'mx-auto' : ''}>
          <button
            type="submit"
            title={collapsed ? 'Expandir' : 'Recolher'}
            aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            className="flex h-7 w-7 items-center justify-center rounded-sm text-dark-foreground-muted transition-colors hover:bg-dark-bg-raised hover:text-dark-foreground"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <polyline points="9 3 5 7 9 11" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  return (
    <li className="relative">
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-accent"
        />
      ) : null}
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={[
          'flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 transition-colors',
          active
            ? 'bg-dark-bg-raised font-medium text-dark-foreground'
            : 'text-dark-foreground-muted hover:bg-dark-bg-raised hover:text-dark-foreground',
          collapsed ? 'justify-center' : '',
        ].join(' ')}
      >
        <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </Link>
    </li>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
