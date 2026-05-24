'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  fetchNotificationsAction,
  markNotificationReadAction,
  markAllReadAction,
} from './notifications-actions';
import type { NotificationItem } from '@/src/services/notifications';

const POLL_INTERVAL_MS = 30_000;

export function NotificationsBell({
  initialUnreadCount,
  initialItems,
}: {
  initialUnreadCount: number;
  initialItems: NotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unread, setUnread] = useState(initialUnreadCount);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const res = await fetchNotificationsAction();
      setItems(res.items);
      setUnread(res.unreadCount);
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    const t = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function onItemClick(it: NotificationItem) {
    if (!it.readAt) {
      setItems((prev) =>
        prev.map((p) => (p.id === it.id ? { ...p, readAt: new Date() } : p)),
      );
      setUnread((u) => Math.max(0, u - 1));
      markNotificationReadAction(it.id).catch(() => {});
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((p) => ({ ...p, readAt: p.readAt ?? new Date() })));
    setUnread(0);
    markAllReadAction().catch(() => {});
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
        className="relative flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-surface-raised text-foreground-secondary transition-colors hover:bg-muted hover:text-foreground"
        title="Notificações"
        aria-label="Notificações"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 2a4 4 0 0 0-4 4v3l-1.5 2h11L12 9V6a4 4 0 0 0-4-4z" />
          <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[0.625rem] font-medium text-accent-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-96 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          <header className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-2.5">
            <p className="font-display text-sm font-medium tracking-tight">
              Notificações
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="text-[0.6875rem] text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            ) : null}
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nenhuma notificação ainda.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border-subtle">
              {items.map((it) => {
                const Wrapper = it.link
                  ? ({ children }: { children: React.ReactNode }) => (
                      <Link
                        href={it.link!}
                        onClick={() => {
                          onItemClick(it);
                          setOpen(false);
                        }}
                        className="block"
                      >
                        {children}
                      </Link>
                    )
                  : ({ children }: { children: React.ReactNode }) => (
                      <button
                        type="button"
                        onClick={() => onItemClick(it)}
                        className="block w-full text-left"
                      >
                        {children}
                      </button>
                    );
                return (
                  <li
                    key={it.id}
                    className={`transition-colors hover:bg-muted/40 ${
                      it.readAt ? 'opacity-70' : 'bg-primary-soft/30'
                    }`}
                  >
                    <Wrapper>
                      <div className="flex gap-2 px-4 py-2.5">
                        <span
                          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                            it.readAt ? 'bg-transparent' : 'bg-primary'
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground">{it.title}</p>
                          {it.body ? (
                            <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-muted-foreground">
                              {it.body}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                            {formatRelative(it.createdAt)}
                          </p>
                        </div>
                      </div>
                    </Wrapper>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}
