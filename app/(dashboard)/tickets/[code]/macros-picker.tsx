'use client';

import { useEffect, useRef, useState } from 'react';
import {
  applyMacroToTicketAction,
  bumpMacroUsageAction,
} from '@/app/(dashboard)/settings/macros/actions';

export type MacroOption = {
  id: string;
  name: string;
  shortcut: string | null;
  bodyRendered: string;
  actionsCount: number;
};

const COMPOSER_FILL_EVENT = 'smartdesk:composer-fill';

export function MacrosPicker({
  ticketId,
  macros,
}: {
  ticketId: string;
  macros: MacroOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const filtered = filterMacros(macros, query);

  async function pick(m: MacroOption) {
    // Insere o body no composer
    window.dispatchEvent(
      new CustomEvent(COMPOSER_FILL_EVENT, {
        detail: { text: m.bodyRendered },
      }),
    );
    setOpen(false);
    setQuery('');

    // Aplica ações (se tiver) ou só bump de uso
    if (m.actionsCount > 0) {
      setApplying(m.id);
      try {
        await applyMacroToTicketAction({ macroId: m.id, ticketId });
      } catch {
        /* já registrou erro */
      } finally {
        setApplying(null);
      }
    } else {
      bumpMacroUsageAction({ macroId: m.id }).catch(() => {});
    }
  }

  if (macros.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground-secondary hover:bg-muted hover:text-foreground"
        title="Inserir macro (Ctrl/Cmd+/)"
      >
        ⚡ Macros
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 px-4 py-20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-md border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-border bg-surface-raised px-4 py-2.5">
              <span aria-hidden className="text-primary">⚡</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlight((h) => Math.max(h - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const m = filtered[highlight];
                    if (m) pick(m);
                  }
                }}
                placeholder="Buscar macro por nome, atalho ou conteúdo…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                Esc
              </kbd>
            </header>
            <ul className="max-h-96 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma macro encontrada
                </li>
              ) : (
                filtered.map((m, i) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => pick(m)}
                      onMouseEnter={() => setHighlight(i)}
                      className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors ${
                        i === highlight ? 'bg-primary-soft' : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">{m.name}</span>
                        {m.shortcut ? (
                          <code className="rounded-sm bg-muted px-1 font-mono text-[0.6875rem] text-muted-foreground">
                            {m.shortcut}
                          </code>
                        ) : null}
                        {m.actionsCount > 0 ? (
                          <span className="pill bg-warning-soft text-warning">
                            ⚡ {m.actionsCount}
                          </span>
                        ) : null}
                        {applying === m.id ? (
                          <span className="text-[0.6875rem] text-muted-foreground">aplicando…</span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-[0.6875rem] text-muted-foreground">
                        {m.bodyRendered.slice(0, 200)}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <footer className="border-t border-border bg-surface-sunken px-4 py-2 text-[0.6875rem] text-muted-foreground">
              <span className="font-mono">↑↓</span> navegar · <span className="font-mono">↵</span> aplicar
              <span className="ml-auto float-right">
                <a
                  href="/settings/macros"
                  className="text-primary hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Gerenciar macros →
                </a>
              </span>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function filterMacros(all: MacroOption[], q: string): MacroOption[] {
  const term = q.trim().toLowerCase();
  if (!term) return all;
  return all.filter((m) => {
    if (m.name.toLowerCase().includes(term)) return true;
    if (m.shortcut?.toLowerCase().includes(term)) return true;
    if (m.bodyRendered.toLowerCase().includes(term)) return true;
    return false;
  });
}
